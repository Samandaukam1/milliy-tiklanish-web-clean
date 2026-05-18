import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSubscriptionPlan, readSubscriptionInfo, upsertSubscriptionInfo } from "@/lib/server/subscriptions";
import type { SubscriptionInfo, SubscriptionPlan } from "@/lib/types";

export type PaymentType = "subscription" | "article";

export type PaymentRecord = {
  id: string;
  provider: string | null;
  user_id: string;
  type: PaymentType;
  tier: string | null;
  article_id: string | null;
  amount: number | null;
  amount_tiyin: number;
  status: string;
  description: string | null;
  return_url: string | null;
  checkout_url: string | null;
  metadata: Record<string, unknown>;
  external_transaction_id: string | null;
  external_receipt_id: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PaymentTransactionRecord = {
  payment_id: string;
  external_transaction_id: string;
  external_receipt_id: string | null;
  account: Record<string, unknown>;
  amount_tiyin: number;
  state: number;
  reason: number | null;
  payme_time: number;
  create_time: number;
  perform_time: number;
  cancel_time: number;
  raw_request: Record<string, unknown>;
};

export type PaymentAccessResult = {
  allowed: boolean;
  source: "free" | "subscription" | "article_purchase" | "none";
  subscriptionInfo?: SubscriptionInfo;
};

export const PAYME_TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export const PAYME_STATE = {
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED: -1,
  CANCELLED_AFTER_PERFORM: -2,
} as const;

export const PAYME_ERROR = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  SYSTEM: -32400,
  AUTH: -32504,
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  ORDER_COMPLETED: -31007,
  CANNOT_PERFORM: -31008,
  ACCOUNT_INVALID: -31050,
} as const;

const SUBSCRIPTION_AMOUNT_SUM: Record<Exclude<SubscriptionPlan, "free">, number> = {
  premium: 29000,
  pro: 89000,
};

const DEFAULT_SINGLE_ARTICLE_AMOUNT_SUM = 9900;
const DEFAULT_RECEIPT_CODE = "10899004001000000";
const DEFAULT_PACKAGE_CODE = "123456";
const DEFAULT_VAT_PERCENT = 12;

const PAYME_MERCHANT_ID = process.env.PAYME_MERCHANT_ID?.trim() ?? "";

// Accept PAYME_KEY (production) or PAYME_TEST_KEY (sandbox/test).
// Fall back to legacy PAYME_MERCHANT_KEY for backwards compatibility.
const _paymeProductionKey = process.env.PAYME_KEY?.trim() ?? "";
const _paymeTestKey = process.env.PAYME_TEST_KEY?.trim() ?? "";
const _paymeLegacyKey = process.env.PAYME_MERCHANT_KEY?.trim() ?? "";

// The active secret used to validate incoming Basic-Auth from Payme.
// Prefer the explicit production key, then test key, then legacy.
const PAYME_MERCHANT_KEY = _paymeProductionKey || _paymeTestKey || _paymeLegacyKey;

// Payme Basic-Auth login is always "Paycom" (per Payme docs).
// Fall back to the merchant ID, then the legacy PAYME_MERCHANT_LOGIN env var.
const PAYME_MERCHANT_LOGIN =
  "Paycom" ||
  PAYME_MERCHANT_ID ||
  (process.env.PAYME_MERCHANT_LOGIN?.trim() ?? "");

const PAYME_RECEIPT_CODE = process.env.PAYME_MXIK_CODE?.trim() || DEFAULT_RECEIPT_CODE;
const PAYME_RECEIPT_PACKAGE_CODE = process.env.PAYME_PACKAGE_CODE?.trim() || DEFAULT_PACKAGE_CODE;
const PAYME_RECEIPT_VAT_PERCENT = normalizePositiveInteger(process.env.PAYME_VAT_PERCENT, DEFAULT_VAT_PERCENT);
const SINGLE_ARTICLE_AMOUNT_SUM = normalizePositiveInteger(process.env.PAYME_SINGLE_ARTICLE_AMOUNT_SUM, DEFAULT_SINGLE_ARTICLE_AMOUNT_SUM);
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function normalizePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function asPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function asInteger(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function compareSecrets(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function localizeMessage(uz: string, ru = uz, en = uz) {
  return { uz, ru, en };
}

function normalizePaymentRecord(row: Record<string, unknown>): PaymentRecord {
  const amountSum = asPositiveNumber(row.amount);
  const amountTiyin = asInteger(row.amount_tiyin, amountSum !== null ? Math.round(amountSum * 100) : 0);

  return {
    id: String(row.id ?? ""),
    provider: asOptionalString(row.provider),
    user_id: String(row.user_id ?? ""),
    type: row.type === "article" ? "article" : "subscription",
    tier: asOptionalString(row.tier),
    article_id: asOptionalString(row.article_id),
    amount: amountSum,
    amount_tiyin: amountTiyin,
    status: asOptionalString(row.status) ?? "pending",
    description: asOptionalString(row.description),
    return_url: asOptionalString(row.return_url),
    checkout_url: asOptionalString(row.checkout_url),
    metadata: asObject(row.metadata),
    external_transaction_id: asOptionalString(row.external_transaction_id),
    external_receipt_id: asOptionalString(row.external_receipt_id),
    paid_at: asOptionalString(row.paid_at),
    cancelled_at: asOptionalString(row.cancelled_at),
    cancel_reason: row.cancel_reason == null ? null : asInteger(row.cancel_reason),
    created_at: asOptionalString(row.created_at),
    updated_at: asOptionalString(row.updated_at),
  };
}

function normalizePaymentTransactionRecord(row: Record<string, unknown>): PaymentTransactionRecord {
  return {
    payment_id: String(row.payment_id ?? ""),
    external_transaction_id: String(row.external_transaction_id ?? ""),
    external_receipt_id: asOptionalString(row.external_receipt_id),
    account: asObject(row.account),
    amount_tiyin: asInteger(row.amount_tiyin),
    state: asInteger(row.state),
    reason: row.reason == null ? null : asInteger(row.reason),
    payme_time: asInteger(row.payme_time),
    create_time: asInteger(row.create_time),
    perform_time: asInteger(row.perform_time),
    cancel_time: asInteger(row.cancel_time),
    raw_request: asObject(row.raw_request),
  };
}

export function isSupabasePaymentServerConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function isPaymeCheckoutConfigured(): boolean {
  return Boolean(PAYME_MERCHANT_ID);
}

export function isPaymeMerchantConfigured(): boolean {
  // Need at least one key (production or test) and the Supabase admin connection.
  return Boolean(PAYME_MERCHANT_KEY && isSupabasePaymentServerConfigured());
}

export function createPaymentsAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function toTiyin(amountSum: number): number {
  return Math.round(amountSum * 100);
}

export function fromTiyin(amountTiyin: number): number {
  return Number((amountTiyin / 100).toFixed(2));
}

export function resolvePaymentPricing(input: { type: PaymentType; tier?: string | null }) {
  if (input.type === "subscription") {
    const normalizedTier = normalizeSubscriptionPlan(input.tier);
    if (normalizedTier === "free") {
      throw new Error("Invalid subscription tier");
    }

    const amountSum = SUBSCRIPTION_AMOUNT_SUM[normalizedTier as Exclude<SubscriptionPlan, "free">];
    return {
      tier: normalizedTier,
      amount_sum: amountSum,
      amount_tiyin: toTiyin(amountSum),
    };
  }

  return {
    tier: null,
    amount_sum: SINGLE_ARTICLE_AMOUNT_SUM,
    amount_tiyin: toTiyin(SINGLE_ARTICLE_AMOUNT_SUM),
  };
}

export function buildPaymentDescription(input: {
  type: PaymentType;
  tier?: string | null;
  articleId?: string | null;
}) {
  if (input.type === "subscription") {
    const normalizedTier = normalizeSubscriptionPlan(input.tier);
    return normalizedTier === "pro"
      ? "Milliy Tiklanish Pro obunasi"
      : "Milliy Tiklanish Premium obunasi";
  }

  return input.articleId
    ? `Milliy Tiklanish maqolasi #${input.articleId}`
    : "Milliy Tiklanish premium maqolasi";
}

export function buildPaymeCheckoutUrl(input: {
  paymentId: string;
  userId: string;
  type: PaymentType;
  tier?: string | null;
  articleId?: string | null;
  amountTiyin: number;
  returnUrl: string;
  language?: string | null;
}) {
  if (!PAYME_MERCHANT_ID) {
    throw new Error("PAYME_MERCHANT_ID not configured");
  }

  const fields: [string, string | number][] = [
    ["m", PAYME_MERCHANT_ID],
    ["ac.payment_id", input.paymentId],
    ["ac.user_id", input.userId],
    ["ac.type", input.type],
    ["a", input.amountTiyin],
    ["c", input.returnUrl],
    ["ct", PAYME_TRANSACTION_TIMEOUT_MS],
    ["l", input.language?.trim() || "uz"],
  ];

  if (input.tier) {
    fields.push(["ac.tier", normalizeSubscriptionPlan(input.tier)]);
  }

  if (input.articleId) {
    fields.push(["ac.article_id", input.articleId]);
  }

  const rawPayload = fields
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join(";");

  return `https://checkout.paycom.uz/${Buffer.from(rawPayload, "utf8").toString("base64")}`;
}

export function validatePaymeAuthorizationHeader(authorizationHeader: string | null) {
  if (!PAYME_MERCHANT_LOGIN || !PAYME_MERCHANT_KEY) {
    return false;
  }

  if (!authorizationHeader?.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = Buffer.from(authorizationHeader.slice(6).trim(), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex <= 0) {
      return false;
    }

    const login = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return compareSecrets(login, PAYME_MERCHANT_LOGIN) && compareSecrets(password, PAYME_MERCHANT_KEY);
  } catch {
    return false;
  }
}

export function paymeSuccess(id: string | number | null | undefined, result: Record<string, unknown>) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

export function paymeError(
  id: string | number | null | undefined,
  code: number,
  message: string | ReturnType<typeof localizeMessage>,
  data?: string
) {
  return Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  });
}

export async function getPaymentById(admin: SupabaseClient, paymentId: string): Promise<PaymentRecord | null> {
  const { data, error } = await (admin.from("payments") as any)
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return normalizePaymentRecord(data as Record<string, unknown>);
}

export async function getPaymentTransactionByExternalId(admin: SupabaseClient, externalTransactionId: string): Promise<PaymentTransactionRecord | null> {
  const { data, error } = await (admin.from("payment_transactions") as any)
    .select("*")
    .eq("external_transaction_id", externalTransactionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return normalizePaymentTransactionRecord(data as Record<string, unknown>);
}

export async function getPaymentTransactionByPaymentId(admin: SupabaseClient, paymentId: string): Promise<PaymentTransactionRecord | null> {
  const { data, error } = await (admin.from("payment_transactions") as any)
    .select("*")
    .eq("payment_id", paymentId)
    .order("create_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return normalizePaymentTransactionRecord(data as Record<string, unknown>);
}

export async function upsertPaymentTransaction(
  admin: SupabaseClient,
  transaction: PaymentTransactionRecord
) {
  await (admin.from("payment_transactions") as any).upsert(
    {
      payment_id: transaction.payment_id,
      provider: "payme",
      external_transaction_id: transaction.external_transaction_id,
      external_receipt_id: transaction.external_receipt_id,
      account: transaction.account,
      amount_tiyin: transaction.amount_tiyin,
      state: transaction.state,
      reason: transaction.reason,
      payme_time: transaction.payme_time,
      create_time: transaction.create_time,
      perform_time: transaction.perform_time,
      cancel_time: transaction.cancel_time,
      raw_request: transaction.raw_request,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "external_transaction_id",
      ignoreDuplicates: false,
    }
  );
}

export function validatePaymentAccount(payment: PaymentRecord, account: Record<string, unknown>) {
  if (asOptionalString(account.payment_id) !== payment.id) {
    return "payment_id";
  }

  if (asOptionalString(account.user_id) !== payment.user_id) {
    return "user_id";
  }

  if (asOptionalString(account.type) !== payment.type) {
    return "type";
  }

  if (payment.type === "subscription") {
    const expectedTier = normalizeSubscriptionPlan(payment.tier);
    const actualTier = normalizeSubscriptionPlan(account.tier);
    if (expectedTier !== actualTier) {
      return "tier";
    }
  }

  if (payment.type === "article" && payment.article_id && asOptionalString(account.article_id) !== payment.article_id) {
    return "article_id";
  }

  return null;
}

export function buildPaymeReceiptDetail(payment: PaymentRecord) {
  const title = payment.description || buildPaymentDescription({
    type: payment.type,
    tier: payment.tier,
    articleId: payment.article_id,
  });

  return {
    receipt_type: 0,
    items: [
      {
        title,
        price: payment.amount_tiyin,
        count: 1,
        code: PAYME_RECEIPT_CODE,
        package_code: PAYME_RECEIPT_PACKAGE_CODE,
        vat_percent: PAYME_RECEIPT_VAT_PERCENT,
      },
    ],
  };
}

export function isTransactionExpired(transaction: PaymentTransactionRecord, now = Date.now()) {
  return transaction.create_time > 0 && transaction.create_time + PAYME_TRANSACTION_TIMEOUT_MS < now;
}

export async function markPaymentPaid(
  admin: SupabaseClient,
  payment: PaymentRecord,
  externalTransactionId: string,
  externalReceiptId: string | null,
  paidAt: string
) {
  await (admin.from("payments") as any)
    .update({
      provider: "payme",
      status: "paid",
      external_transaction_id: externalTransactionId,
      external_receipt_id: externalReceiptId,
      paid_at: paidAt,
      cancel_reason: null,
      cancelled_at: null,
      updated_at: paidAt,
    })
    .eq("id", payment.id);
}

export async function markPaymentCancelled(
  admin: SupabaseClient,
  payment: PaymentRecord,
  externalTransactionId: string,
  reason: number | null,
  cancelledAt: string
) {
  await (admin.from("payments") as any)
    .update({
      provider: "payme",
      status: "cancelled",
      external_transaction_id: externalTransactionId,
      cancel_reason: reason,
      cancelled_at: cancelledAt,
      updated_at: cancelledAt,
    })
    .eq("id", payment.id);
}

export async function grantPaymentEntitlement(admin: SupabaseClient, payment: PaymentRecord) {
  if (payment.type === "subscription") {
    const plan = normalizeSubscriptionPlan(payment.tier);
    const startsAt = payment.paid_at ?? new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await (admin.from("profiles") as any)
      .update({
        subscription: plan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.user_id);

    await upsertSubscriptionInfo(
      admin,
      {
        userId: payment.user_id,
        plan,
        status: "active",
        starts_at: startsAt,
        expires_at: expiresAt,
        payment_id: payment.id,
      },
      { strict: false }
    );

    return;
  }

  if (payment.article_id) {
    await (admin.from("article_purchases") as any).upsert(
      {
        user_id: payment.user_id,
        article_id: payment.article_id,
        payment_id: payment.id,
        provider: "payme",
        status: "active",
        purchased_at: payment.paid_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,article_id",
        ignoreDuplicates: false,
      }
    );
  }
}

export async function revokePaymentEntitlement(admin: SupabaseClient, payment: PaymentRecord) {
  if (payment.type === "subscription") {
    const now = new Date().toISOString();

    await (admin.from("profiles") as any)
      .update({
        subscription: "free",
        updated_at: now,
      })
      .eq("id", payment.user_id);

    await upsertSubscriptionInfo(
      admin,
      {
        userId: payment.user_id,
        plan: "free",
        status: "cancelled",
        starts_at: payment.paid_at,
        expires_at: now,
        payment_id: payment.id,
      },
      { strict: false }
    );

    return;
  }

  if (payment.article_id) {
    await (admin.from("article_purchases") as any)
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("payment_id", payment.id);
  }
}

export async function resolveArticleAccess(
  admin: SupabaseClient,
  input: { userId: string | null | undefined; articleId: string | null | undefined }
): Promise<PaymentAccessResult> {
  if (!input.userId) {
    return { allowed: false, source: "none" };
  }

  const subscriptionInfo = await readSubscriptionInfo(admin, input.userId, "free");
  if (subscriptionInfo.plan !== "free" && subscriptionInfo.status === "active") {
    return { allowed: true, source: "subscription", subscriptionInfo };
  }

  if (!input.articleId) {
    return { allowed: false, source: "none", subscriptionInfo };
  }

  const { data, error } = await (admin.from("article_purchases") as any)
    .select("id")
    .eq("user_id", input.userId)
    .eq("article_id", input.articleId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    return { allowed: true, source: "article_purchase", subscriptionInfo };
  }

  return { allowed: false, source: "none", subscriptionInfo };
}

export async function buildPaymentStatusPayload(admin: SupabaseClient, payment: PaymentRecord) {
  const access = payment.type === "article"
    ? await resolveArticleAccess(admin, { userId: payment.user_id, articleId: payment.article_id })
    : { allowed: false, source: "none" as const };

  const subscriptionInfo = payment.type === "subscription"
    ? await readSubscriptionInfo(admin, payment.user_id, payment.tier)
    : access.subscriptionInfo;

  return {
    status: payment.status,
    provider: payment.provider ?? "payme",
    amount: payment.amount ?? fromTiyin(payment.amount_tiyin),
    amount_tiyin: payment.amount_tiyin,
    tier: payment.tier,
    type: payment.type,
    article_id: payment.article_id,
    paid_at: payment.paid_at,
    cancelled_at: payment.cancelled_at,
    cancel_reason: payment.cancel_reason,
    subscription_info: payment.type === "subscription" ? subscriptionInfo : undefined,
    article_access: payment.type === "article" ? access.allowed : undefined,
  };
}

export function buildPaymeAccountError(fieldName: string) {
  return paymeError(
    null,
    PAYME_ERROR.ACCOUNT_INVALID,
    localizeMessage(
      "Foydalanuvchi ma'lumotlari noto'g'ri",
      "Неверные данные пользователя",
      "Invalid account data"
    ),
    fieldName
  );
}
