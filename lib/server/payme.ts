import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSubscriptionPlan, readSubscriptionInfo, upsertSubscriptionInfo } from "./subscriptions";
import type { SubscriptionInfo, SubscriptionPlan } from "../types";

export type PaymentType = "subscription" | "article";

export type PremiumMonthlyPaymeAccount = {
  userId: string;
  subscriptionType: string;
  subscriptionId: string;
  rawAccount: Record<string, unknown>;
};

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

export type PaymentLogInput = {
  paymentId?: string | null;
  event: string;
  method?: string | null;
  requestId?: string | number | null;
  externalTransactionId?: string | null;
  state?: number | null;
  status?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorCode?: number | null;
  errorMessage?: unknown;
};

export type UserPaymentEligibility = {
  exists: boolean;
  active: boolean;
  table: "profiles" | "users" | null;
  data?: string;
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
  METHOD_NOT_POST: -32300,
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  SYSTEM: -32400,
  AUTH: -32504,
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  ORDER_COMPLETED: -31007,
  CANNOT_PERFORM: -31008,
  ACCOUNT_INVALID: -31050,
} as const;

const SUBSCRIPTION_AMOUNT_SUM: Record<Exclude<SubscriptionPlan, "free">, number> = {
  premium: 24000,
  pro: 89000,
};

export const PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE = "premium_monthly";
export const PAYME_PREMIUM_SUBSCRIPTION_ID = "premium";
export const PAYME_PREMIUM_MONTHLY_AMOUNT_SUM = 24000;
export const PAYME_PREMIUM_MONTHLY_AMOUNT_TIYIN = 2400000;

const DEFAULT_SINGLE_ARTICLE_AMOUNT_SUM = 9900;
const DEFAULT_RECEIPT_CODE = "10899004001000000";
const DEFAULT_PACKAGE_CODE = "121";
const DEFAULT_VAT_PERCENT = 0;
const PREMIUM_SUBSCRIPTION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PAYME_TRANSACTION_TABLE = "payme_transactions";
const LEGACY_PAYME_TRANSACTION_TABLE = "payment_transactions";
const PAYMENT_LOG_TABLE = "payment_logs";
const PAYME_CANCEL_REASON_TIMEOUT = 4;
const DEFAULT_PAYME_MERCHANT_ID = "6a0aa667f424d415a5bc18da";
const PAYME_PRODUCTION_CHECKOUT_URL = "https://checkout.paycom.uz";
const PAYME_SANDBOX_CHECKOUT_URL = "https://test.paycom.uz";

function isEnabledEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

const PAYME_TEST_MODE = isEnabledEnv(process.env.PAYME_TEST_MODE);
const PAYME_MERCHANT_ID = process.env.PAYME_MERCHANT_ID?.trim() || DEFAULT_PAYME_MERCHANT_ID;

// PAYME_SECRET_KEY is the preferred generic merchant secret. In sandbox mode
// PAYME_KEY is intentionally ignored so a production key is not accepted there.
const _paymeSecretKey = process.env.PAYME_SECRET_KEY?.trim() ?? "";
const _paymeProductionKey = _paymeSecretKey || process.env.PAYME_KEY?.trim() || "";
const _paymeTestKey = process.env.PAYME_TEST_KEY?.trim() || _paymeSecretKey;
const _paymeLegacyKey = process.env.PAYME_MERCHANT_KEY?.trim() ?? "";
const PAYME_MERCHANT_KEY = PAYME_TEST_MODE
  ? _paymeTestKey
  : _paymeProductionKey || _paymeLegacyKey;

// Payme Basic-Auth login is "Paycom" unless the cashier is configured otherwise.
const PAYME_MERCHANT_LOGIN = process.env.PAYME_MERCHANT_LOGIN?.trim() || "Paycom";
const PAYME_CHECKOUT_BASE_URL = (
  PAYME_TEST_MODE
    ? PAYME_SANDBOX_CHECKOUT_URL
    : process.env.PAYME_CHECKOUT_URL?.trim() || PAYME_PRODUCTION_CHECKOUT_URL
).replace(/\/+$/, "");

const PAYME_RECEIPT_CODE = process.env.PAYME_MXIK_CODE?.trim() || DEFAULT_RECEIPT_CODE;
const PAYME_RECEIPT_PACKAGE_CODE = process.env.PAYME_PACKAGE_CODE?.trim() || DEFAULT_PACKAGE_CODE;
const PAYME_RECEIPT_VAT_PERCENT = normalizeNonNegativeInteger(process.env.PAYME_VAT_PERCENT, DEFAULT_VAT_PERCENT);
const SINGLE_ARTICLE_AMOUNT_SUM = normalizePositiveInteger(process.env.PAYME_SINGLE_ARTICLE_AMOUNT_SUM, DEFAULT_SINGLE_ARTICLE_AMOUNT_SUM);
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function normalizePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

function formatSupabaseError(error: { message?: string | null; details?: string | null; hint?: string | null; code?: string | null } | null | undefined): string {
  return [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" | ");
}

function isMissingSchemaError(errorText: string): boolean {
  return /relation .* does not exist|table .* does not exist|column .* does not exist|schema cache|could not find/i.test(errorText);
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

export function getPremiumMonthlyPaymentDescription(): string {
  return "Milliy Tiklanish Premium obunasi";
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
    ["a", input.amountTiyin],
    ["c", input.returnUrl],
    ["ct", PAYME_TRANSACTION_TIMEOUT_MS],
    ["l", input.language?.trim() || "uz"],
  ];

  if (input.type === "subscription") {
    fields.push(
      ["ac.user_id", input.userId],
      ["ac.subscription_type", PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE],
      ["ac.subscription_id", PAYME_PREMIUM_SUBSCRIPTION_ID]
    );
  } else {
    fields.push(
      ["ac.payment_id", input.paymentId],
      ["ac.user_id", input.userId],
      ["ac.type", input.type]
    );
  }

  if (input.articleId) {
    fields.push(["ac.article_id", input.articleId]);
  }

  const rawPayload = fields
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join(";");

  return `${PAYME_CHECKOUT_BASE_URL}/${Buffer.from(rawPayload, "utf8").toString("base64")}`;
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

export async function getPendingPremiumMonthlyPayment(
  admin: SupabaseClient,
  userId: string
): Promise<PaymentRecord | null> {
  const { data, error } = await (admin.from("payments") as any)
    .select("*")
    .eq("provider", "payme")
    .eq("user_id", userId)
    .eq("type", "subscription")
    .eq("tier", PAYME_PREMIUM_SUBSCRIPTION_ID)
    .eq("status", "pending")
    .eq("amount_tiyin", PAYME_PREMIUM_MONTHLY_AMOUNT_TIYIN)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return normalizePaymentRecord(data as Record<string, unknown>);
}

export async function createPremiumMonthlyPayment(
  admin: SupabaseClient,
  input: PremiumMonthlyPaymeAccount
): Promise<PaymentRecord> {
  const now = new Date().toISOString();
  const metadata = {
    user_id: input.userId,
    type: "subscription",
    plan: PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE,
    subscription_type: input.subscriptionType,
    subscription_id: input.subscriptionId,
    tier: PAYME_PREMIUM_SUBSCRIPTION_ID,
    account: input.rawAccount,
  };
  const basePayload: Record<string, unknown> = {
    provider: "payme",
    user_id: input.userId,
    type: "subscription",
    plan: PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE,
    tier: PAYME_PREMIUM_SUBSCRIPTION_ID,
    article_id: null,
    amount: PAYME_PREMIUM_MONTHLY_AMOUNT_SUM,
    amount_tiyin: PAYME_PREMIUM_MONTHLY_AMOUNT_TIYIN,
    status: "pending",
    description: getPremiumMonthlyPaymentDescription(),
    account: input.rawAccount,
    metadata,
    created_at: now,
    updated_at: now,
  };

  const payloadVariants = [
    basePayload,
    Object.fromEntries(Object.entries(basePayload).filter(([key]) => key !== "account")),
    Object.fromEntries(Object.entries(basePayload).filter(([key]) => key !== "plan")),
    Object.fromEntries(Object.entries(basePayload).filter(([key]) => key !== "account" && key !== "plan")),
  ];

  let lastErrorText = "";
  for (const payload of payloadVariants) {
    const { data, error } = await (admin.from("payments") as any)
      .insert(payload)
      .select("*")
      .single();

    if (!error && data) {
      return normalizePaymentRecord(data as Record<string, unknown>);
    }

    lastErrorText = formatSupabaseError(error) || lastErrorText;
    if (!isMissingSchemaError(lastErrorText)) {
      break;
    }
  }

  throw new Error(lastErrorText || "premium_monthly_payment_create_failed");
}

export async function getPaymentTransactionByExternalId(admin: SupabaseClient, externalTransactionId: string): Promise<PaymentTransactionRecord | null> {
  for (const table of [PAYME_TRANSACTION_TABLE, LEGACY_PAYME_TRANSACTION_TABLE]) {
    const { data, error } = await (admin.from(table) as any)
      .select("*")
      .eq("external_transaction_id", externalTransactionId)
      .maybeSingle();

    if (!error && data) {
      return normalizePaymentTransactionRecord(data as Record<string, unknown>);
    }

    const errorText = formatSupabaseError(error);
    if (error && !isMissingSchemaError(errorText)) {
      console.warn("[payme] Failed to read transaction", { table, error: errorText });
      return null;
    }
  }

  return null;
}

export async function getPaymentTransactionByPaymentId(admin: SupabaseClient, paymentId: string): Promise<PaymentTransactionRecord | null> {
  for (const table of [PAYME_TRANSACTION_TABLE, LEGACY_PAYME_TRANSACTION_TABLE]) {
    const { data, error } = await (admin.from(table) as any)
      .select("*")
      .eq("payment_id", paymentId)
      .order("create_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return normalizePaymentTransactionRecord(data as Record<string, unknown>);
    }

    const errorText = formatSupabaseError(error);
    if (error && !isMissingSchemaError(errorText)) {
      console.warn("[payme] Failed to read transaction by payment", { table, error: errorText });
      return null;
    }
  }

  return null;
}

export async function getPaymentTransactionsForStatement(admin: SupabaseClient, from: number, to: number): Promise<PaymentTransactionRecord[]> {
  const { data, error } = await (admin.from(PAYME_TRANSACTION_TABLE) as any)
    .select("*")
    .gte("payme_time", from)
    .lte("payme_time", to)
    .order("payme_time", { ascending: true });

  if (error) {
    const errorText = formatSupabaseError(error);
    throw new Error(errorText || "payme_statement_read_failed");
  }

  return (Array.isArray(data) ? data : []).map((row) => normalizePaymentTransactionRecord(row as Record<string, unknown>));
}

export async function upsertPaymentTransaction(
  admin: SupabaseClient,
  transaction: PaymentTransactionRecord
) {
  await (admin.from(PAYME_TRANSACTION_TABLE) as any).upsert(
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

export async function logPaymentEvent(admin: SupabaseClient, input: PaymentLogInput): Promise<void> {
  try {
    const { error } = await (admin.from(PAYMENT_LOG_TABLE) as any).insert({
      payment_id: input.paymentId ?? null,
      provider: "payme",
      event: input.event,
      method: input.method ?? null,
      request_id: input.requestId == null ? null : String(input.requestId),
      external_transaction_id: input.externalTransactionId ?? null,
      state: input.state ?? null,
      status: input.status ?? null,
      request_payload: input.requestPayload ?? {},
      response_payload: input.responsePayload ?? {},
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
    });

    if (error) {
      const errorText = formatSupabaseError(error);
      if (!isMissingSchemaError(errorText)) {
        console.warn("[payme] Failed to write payment log", errorText);
      }
    }
  } catch (error) {
    console.warn("[payme] Failed to write payment log", error);
  }
}

function isInactiveUserRow(row: Record<string, unknown>): string | null {
  const status = asOptionalString(row.status)?.toLowerCase();
  if (status && ["inactive", "blocked", "banned", "deleted", "disabled"].includes(status)) {
    return "status";
  }

  if (row.is_active === false || row.active === false) {
    return "is_active";
  }

  if (row.deleted_at || row.blocked_at || row.banned_at) {
    return "status";
  }

  return null;
}

function addPremiumSubscriptionDuration(date: Date): Date {
  return new Date(date.getTime() + PREMIUM_SUBSCRIPTION_DURATION_MS);
}

export async function getUserPaymentEligibility(admin: SupabaseClient, userId: string): Promise<UserPaymentEligibility> {
  const { data, error } = await (admin.from("profiles") as any)
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!error && data) {
    const inactiveField = isInactiveUserRow(data as Record<string, unknown>);
    return {
      exists: true,
      active: !inactiveField,
      table: "profiles",
      data: inactiveField ?? undefined,
    };
  }

  const errorText = formatSupabaseError(error);
  if (error && !isMissingSchemaError(errorText)) {
    console.warn("[payme] Failed to check profile eligibility", { error: errorText });
  }

  return { exists: false, active: false, table: "profiles", data: "user_id" };
}

export function validatePaymentAccount(payment: PaymentRecord, account: Record<string, unknown>) {
  const accountPaymentId = asOptionalString(account.payment_id);
  if (accountPaymentId && accountPaymentId !== payment.id) {
    return "payment_id";
  }

  const accountUserId = asOptionalString(account.user_id);
  if (!accountPaymentId && !accountUserId) {
    return "user_id";
  }

  if (accountUserId && accountUserId !== payment.user_id) {
    return "user_id";
  }

  const subscriptionType = asOptionalString(account.subscription_type);
  if (payment.type === "subscription" && subscriptionType && subscriptionType !== PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE) {
    return "subscription_type";
  }

  const subscriptionId = asOptionalString(account.subscription_id);
  if (payment.type === "subscription" && subscriptionId && subscriptionId !== PAYME_PREMIUM_SUBSCRIPTION_ID) {
    return "subscription_id";
  }

  const accountType = asOptionalString(account.type);
  if (accountType && accountType !== payment.type) {
    return "type";
  }

  if (payment.type === "subscription" && asOptionalString(account.tier)) {
    const expectedTier = normalizeSubscriptionPlan(payment.tier);
    const actualTier = normalizeSubscriptionPlan(account.tier);
    if (expectedTier !== actualTier) {
      return "tier";
    }
  }

  const accountArticleId = asOptionalString(account.article_id);
  if (payment.type === "article" && payment.article_id && accountArticleId && accountArticleId !== payment.article_id) {
    return "article_id";
  }

  return null;
}

export function buildPaymeReceiptDetail(payment: PaymentRecord) {
  const isPremiumMonthly = payment.type === "subscription" && normalizeSubscriptionPlan(payment.tier) === "premium";
  const title = isPremiumMonthly
    ? "Milliy Tiklanish Premium"
    : payment.description || buildPaymentDescription({
      type: payment.type,
      tier: payment.tier,
      articleId: payment.article_id,
    });

  return {
    receipt_type: 0,
    items: [
      {
        title,
        price: isPremiumMonthly ? PAYME_PREMIUM_MONTHLY_AMOUNT_TIYIN : payment.amount_tiyin,
        count: 1,
        code: isPremiumMonthly ? DEFAULT_RECEIPT_CODE : PAYME_RECEIPT_CODE,
        package_code: isPremiumMonthly ? DEFAULT_PACKAGE_CODE : PAYME_RECEIPT_PACKAGE_CODE,
        vat_percent: isPremiumMonthly ? DEFAULT_VAT_PERCENT : PAYME_RECEIPT_VAT_PERCENT,
      },
    ],
  };
}

export function isTransactionExpired(transaction: PaymentTransactionRecord, now = Date.now()) {
  return transaction.create_time > 0 && transaction.create_time + PAYME_TRANSACTION_TIMEOUT_MS < now;
}

export async function expirePaymentTransaction(
  admin: SupabaseClient,
  payment: PaymentRecord,
  transaction: PaymentTransactionRecord,
  rawRequest: Record<string, unknown>
) {
  const cancelTime = Date.now();

  await upsertPaymentTransaction(admin, {
    ...transaction,
    state: PAYME_STATE.CANCELLED,
    reason: PAYME_CANCEL_REASON_TIMEOUT,
    cancel_time: cancelTime,
    raw_request: rawRequest,
  });

  await markPaymentCancelled(
    admin,
    payment,
    transaction.external_transaction_id,
    PAYME_CANCEL_REASON_TIMEOUT,
    new Date(cancelTime).toISOString()
  );
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

async function updateUserSubscriptionColumns(
  admin: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
): Promise<void> {
  for (const table of ["profiles", "users"] as const) {
    const payloadVariants = [
      patch,
      {
        subscription: patch.subscription,
        subscription_starts_at: patch.subscription_starts_at,
        subscription_expires_at: patch.subscription_expires_at,
        updated_at: patch.updated_at,
      },
      {
        subscription: patch.subscription,
        updated_at: patch.updated_at,
      },
    ];

    for (const payload of payloadVariants) {
      const { error } = await (admin.from(table) as any)
        .update(payload)
        .eq("id", userId);

      if (!error) {
        break;
      }

      const errorText = formatSupabaseError(error);
      if (isMissingSchemaError(errorText)) {
        continue;
      }

      console.warn("[payme] Failed to update user subscription columns", { table, error: errorText });
      break;
    }
  }
}

export async function grantPaymentEntitlement(admin: SupabaseClient, payment: PaymentRecord) {
  if (payment.type === "subscription") {
    const plan = normalizeSubscriptionPlan(payment.tier);
    const startsAt = payment.paid_at ?? new Date().toISOString();
    const expiresAt = addPremiumSubscriptionDuration(new Date(startsAt)).toISOString();

    await updateUserSubscriptionColumns(admin, payment.user_id, {
      subscription: plan,
      subscription_starts_at: startsAt,
      subscription_expires_at: expiresAt,
      premium_until: expiresAt,
      updated_at: new Date().toISOString(),
    });

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

    await updateUserSubscriptionColumns(admin, payment.user_id, {
      subscription: "free",
      subscription_expires_at: now,
      premium_until: now,
      updated_at: now,
    });

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
