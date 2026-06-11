import {
  buildPaymeReceiptDetail,
  createPremiumMonthlyPayment,
  createPaymentsAdminClient,
  expirePaymentTransaction,
  getPendingPremiumMonthlyPayment,
  getPaymentById,
  getPaymentTransactionByExternalId,
  getPaymentTransactionByPaymentId,
  getPaymentTransactionsForStatement,
  getPremiumMonthlyPaymentDescription,
  getUserPaymentEligibility,
  grantPaymentEntitlement,
  isPaymeMerchantConfigured,
  isSupabasePaymentServerConfigured,
  isTransactionExpired,
  logPaymentEvent,
  markPaymentCancelled,
  markPaymentPaid,
  PAYME_ERROR,
  PAYME_PREMIUM_MONTHLY_AMOUNT_SUM,
  PAYME_PREMIUM_MONTHLY_AMOUNT_TIYIN,
  PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE,
  PAYME_PREMIUM_SUBSCRIPTION_ID,
  PAYME_STATE,
  revokePaymentEntitlement,
  upsertPaymentTransaction,
  validatePaymentAccount,
  validatePaymeAuthorizationHeader,
  type PaymentRecord,
  type PaymentTransactionRecord,
} from "../../lib/server/payme";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServerlessRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | string>;
};

type ServerlessResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ServerlessResponse;
  json(body: unknown): void;
};

type PaymeRpcId = string | number | null | undefined;

type PaymeMerchantRequest = {
  jsonrpc?: string;
  id?: PaymeRpcId;
  method?: string;
  params?: Record<string, unknown> | null;
};

type LocalizedMessage = {
  uz: string;
  ru: string;
  en: string;
};

type PaymeRpcError = {
  code: number;
  message: string | LocalizedMessage;
  data?: string;
};

type PaymeRpcResponseBody = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: PaymeRpcError;
};

type ResponseMeta = {
  paymentId?: string | null;
  externalTransactionId?: string | null;
  state?: number | null;
};

type PremiumMonthlyAccount = {
  userId: string;
  subscriptionType: string;
  subscriptionId: string;
  rawAccount: Record<string, unknown>;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function getHeader(req: ServerlessRequest, name: string): string | null {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

async function readJsonBody(req: ServerlessRequest): Promise<unknown> {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  const chunks: string[] = [];
  if (typeof req[Symbol.asyncIterator] === "function") {
    for await (const chunk of req as AsyncIterable<Buffer | string>) {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    }
  }

  return JSON.parse(chunks.join("") || "{}");
}

function localizedMessage(uz: string, ru = uz, en = uz): LocalizedMessage {
  return { uz, ru, en };
}

function successBody(id: PaymeRpcId, result: Record<string, unknown>): PaymeRpcResponseBody {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

function errorBody(
  id: PaymeRpcId,
  code: number,
  message: string | LocalizedMessage,
  data?: string
): PaymeRpcResponseBody {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  };
}

function accountValidationError(id: PaymeRpcId, fieldName: string): PaymeRpcResponseBody {
  return errorBody(
    id,
    PAYME_ERROR.ACCOUNT_INVALID,
    localizedMessage(
      "Foydalanuvchi yoki buyurtma ma'lumotlari noto'g'ri",
      "Неверные данные пользователя или заказа",
      "Invalid user or order account data"
    ),
    fieldName
  );
}

function invalidAmountError(id: PaymeRpcId): PaymeRpcResponseBody {
  return errorBody(
    id,
    PAYME_ERROR.INVALID_AMOUNT,
    localizedMessage("Noto'g'ri summa", "Неверная сумма", "Invalid amount")
  );
}

function cannotPerformError(id: PaymeRpcId, message?: string): PaymeRpcResponseBody {
  return errorBody(
    id,
    PAYME_ERROR.CANNOT_PERFORM,
    localizedMessage(
      message ?? "Operatsiyani bajarib bo'lmaydi",
      "Невозможно выполнить операцию",
      "Cannot perform operation"
    )
  );
}

function accountBusyError(id: PaymeRpcId): PaymeRpcResponseBody {
  return errorBody(
    id,
    PAYME_ERROR.ACCOUNT_INVALID,
    localizedMessage(
      "Bu obuna uchun pending to'lov mavjud",
      "По этому аккаунту уже есть ожидающий платеж",
      "A pending payment already exists for this account"
    ),
    "account"
  );
}

function transactionNotFoundError(id: PaymeRpcId): PaymeRpcResponseBody {
  return errorBody(
    id,
    PAYME_ERROR.TRANSACTION_NOT_FOUND,
    localizedMessage("Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found")
  );
}

function buildPremiumMonthlyPreviewPayment(account: PremiumMonthlyAccount): PaymentRecord {
  return {
    id: "",
    provider: "payme",
    user_id: account.userId,
    type: "subscription",
    tier: PAYME_PREMIUM_SUBSCRIPTION_ID,
    article_id: null,
    amount: PAYME_PREMIUM_MONTHLY_AMOUNT_SUM,
    amount_tiyin: PAYME_PREMIUM_MONTHLY_AMOUNT_TIYIN,
    status: "pending",
    description: getPremiumMonthlyPaymentDescription(),
    return_url: null,
    checkout_url: null,
    metadata: {
      plan: PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE,
      subscription_type: account.subscriptionType,
      subscription_id: account.subscriptionId,
      account: account.rawAccount,
    },
    external_transaction_id: null,
    external_receipt_id: null,
    paid_at: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: null,
    updated_at: null,
  };
}

function getResponseState(body: PaymeRpcResponseBody, fallback?: number | null): number | null {
  const state = body.result?.state;
  return typeof state === "number" ? state : fallback ?? null;
}

function getResponsePaymentId(body: PaymeRpcResponseBody, fallback?: string | null): string | null {
  const transaction = body.result?.transaction;
  if (typeof transaction === "string" && transaction.trim()) {
    return transaction.trim();
  }

  const additional = asObject(body.result?.additional);
  const paymentId = asString(additional.payment_id);
  return paymentId || fallback || null;
}

function extractErrorMessage(error: PaymeRpcError | undefined): unknown {
  return error?.message ?? null;
}

async function buildRpcResponse(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest,
  body: PaymeRpcResponseBody,
  meta: ResponseMeta = {}
): Promise<PaymeRpcResponseBody> {
  const params = asObject(payload.params);
  const externalTransactionId = meta.externalTransactionId ?? (asString(params.id) || null);
  const paymentId = meta.paymentId ?? getResponsePaymentId(body, meta.paymentId ?? null);

  await logPaymentEvent(admin, {
    paymentId,
    event: body.error ? "merchant_error" : "merchant_success",
    method: payload.method ?? null,
    requestId: payload.id ?? null,
    externalTransactionId,
    state: getResponseState(body, meta.state),
    status: body.error ? "error" : "ok",
    requestPayload: payload as Record<string, unknown>,
    responsePayload: body,
    errorCode: body.error?.code ?? null,
    errorMessage: extractErrorMessage(body.error),
  });

  return body;
}

function createResult(transaction: PaymentTransactionRecord): Record<string, unknown> {
  return {
    create_time: transaction.create_time,
    transaction: transaction.payment_id,
    state: transaction.state,
  };
}

function performResult(transaction: PaymentTransactionRecord): Record<string, unknown> {
  return {
    transaction: transaction.payment_id,
    perform_time: transaction.perform_time,
    state: transaction.state,
  };
}

function cancelResult(transaction: PaymentTransactionRecord): Record<string, unknown> {
  return {
    transaction: transaction.payment_id,
    cancel_time: transaction.cancel_time,
    state: transaction.state,
  };
}

function checkResult(transaction: PaymentTransactionRecord): Record<string, unknown> {
  return {
    create_time: transaction.create_time,
    perform_time: transaction.perform_time,
    cancel_time: transaction.cancel_time,
    transaction: transaction.payment_id,
    state: transaction.state,
    reason: transaction.reason,
  };
}

async function validatePaymentForPayme(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest,
  payment: PaymentRecord,
  account: Record<string, unknown>,
  amountTiyin: number
): Promise<PaymeRpcResponseBody | null> {
  const invalidField = validatePaymentAccount(payment, account);
  if (invalidField) {
    return accountValidationError(payload.id, invalidField);
  }

  if (amountTiyin !== payment.amount_tiyin) {
    return invalidAmountError(payload.id);
  }

  const eligibility = await getUserPaymentEligibility(admin, payment.user_id);
  if (!eligibility.exists || !eligibility.active) {
    return accountValidationError(payload.id, eligibility.data ?? "user_id");
  }

  if (payment.status === "paid") {
    return cannotPerformError(payload.id, "To'lov allaqachon yakunlangan");
  }

  if (payment.status === "cancelled" || payment.status === "failed") {
    return cannotPerformError(payload.id, "To'lov bekor qilingan");
  }

  return null;
}

async function validatePremiumMonthlyAccount(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest,
  account: Record<string, unknown>,
  amountTiyin: number
): Promise<{ account: PremiumMonthlyAccount } | { error: PaymeRpcResponseBody }> {
  const userId = asString(account.user_id);
  if (!userId) {
    return { error: accountValidationError(payload.id, "user_id") };
  }

  const subscriptionType = asString(account.subscription_type);
  if (subscriptionType !== PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE) {
    return { error: accountValidationError(payload.id, "subscription_type") };
  }

  const subscriptionId = asString(account.subscription_id);
  if (subscriptionId !== PAYME_PREMIUM_SUBSCRIPTION_ID) {
    return { error: accountValidationError(payload.id, "subscription_id") };
  }

  if (amountTiyin !== PAYME_PREMIUM_MONTHLY_AMOUNT_TIYIN) {
    return { error: invalidAmountError(payload.id) };
  }

  const eligibility = await getUserPaymentEligibility(admin, userId);
  if (!eligibility.exists || !eligibility.active) {
    return { error: accountValidationError(payload.id, eligibility.data ?? "user_id") };
  }

  return {
    account: {
      userId,
      subscriptionType,
      subscriptionId,
      rawAccount: account,
    },
  };
}

async function handleCheckPerformTransaction(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest
): Promise<PaymeRpcResponseBody> {
  const params = asObject(payload.params);
  const account = asObject(params.account);
  const amountTiyin = asNumber(params.amount);
  const paymentId = asString(account.payment_id);
  const payment = paymentId ? await getPaymentById(admin, paymentId) : null;

  if (paymentId && !payment) {
    return buildRpcResponse(admin, payload, accountValidationError(payload.id, "payment_id"), { paymentId });
  }

  if (payment) {
    const validationError = await validatePaymentForPayme(admin, payload, payment, account, amountTiyin);
    if (validationError) {
      return buildRpcResponse(admin, payload, validationError, { paymentId: payment.id });
    }

    return buildRpcResponse(
      admin,
      payload,
      successBody(payload.id, {
        allow: true,
        additional: {
          payment_id: payment.id,
          user_id: payment.user_id,
          type: payment.type,
          tier: payment.tier,
          subscription_type: PAYME_PREMIUM_MONTHLY_SUBSCRIPTION_TYPE,
          subscription_id: PAYME_PREMIUM_SUBSCRIPTION_ID,
        },
        detail: buildPaymeReceiptDetail(payment),
      }),
      { paymentId: payment.id }
    );
  }

  const validation = await validatePremiumMonthlyAccount(admin, payload, account, amountTiyin);
  if ("error" in validation) {
    return buildRpcResponse(admin, payload, validation.error, { paymentId: null });
  }
  const previewPayment = buildPremiumMonthlyPreviewPayment(validation.account);

  return buildRpcResponse(
    admin,
    payload,
    successBody(payload.id, {
      allow: true,
      additional: {
        user_id: validation.account.userId,
        type: "subscription",
        tier: PAYME_PREMIUM_SUBSCRIPTION_ID,
        subscription_type: validation.account.subscriptionType,
        subscription_id: validation.account.subscriptionId,
      },
      detail: buildPaymeReceiptDetail(previewPayment),
    })
  );
}

async function handleCreateTransaction(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest
): Promise<PaymeRpcResponseBody> {
  const params = asObject(payload.params);
  const externalTransactionId = asString(params.id);
  const paymeTime = asNumber(params.time) || Date.now();
  const amountTiyin = asNumber(params.amount);
  const account = asObject(params.account);
  const paymentId = asString(account.payment_id);

  console.log("[Payme CreateTransaction] payme id:", externalTransactionId || "<empty>");

  if (!externalTransactionId) {
    return buildRpcResponse(admin, payload, transactionNotFoundError(payload.id), { paymentId });
  }

  const existingByExternal = await getPaymentTransactionByExternalId(admin, externalTransactionId);
  if (existingByExternal) {
    const existingPayment = await getPaymentById(admin, existingByExternal.payment_id);
    if (!existingPayment) {
      return buildRpcResponse(admin, payload, transactionNotFoundError(payload.id), {
        paymentId: existingByExternal.payment_id,
        externalTransactionId,
      });
    }

    const validationError = await validatePaymentForPayme(admin, payload, existingPayment, account, amountTiyin);
    if (validationError && existingPayment.status !== "paid" && existingPayment.status !== "cancelled") {
      return buildRpcResponse(admin, payload, validationError, {
        paymentId: existingPayment.id,
        externalTransactionId,
        state: existingByExternal.state,
      });
    }

    return buildRpcResponse(admin, payload, successBody(payload.id, createResult(existingByExternal)), {
      paymentId: existingPayment.id,
      externalTransactionId,
      state: existingByExternal.state,
    });
  }

  let payment = paymentId ? await getPaymentById(admin, paymentId) : null;
  let premiumAccount: PremiumMonthlyAccount | null = null;

  if (paymentId && !payment) {
    return buildRpcResponse(admin, payload, accountValidationError(payload.id, "payment_id"), {
      paymentId,
      externalTransactionId,
    });
  }

  if (!payment) {
    const validation = await validatePremiumMonthlyAccount(admin, payload, account, amountTiyin);
    if ("error" in validation) {
      return buildRpcResponse(admin, payload, validation.error, { externalTransactionId });
    }

    premiumAccount = validation.account;
    payment = await getPendingPremiumMonthlyPayment(admin, premiumAccount.userId);
    if (!payment) {
      payment = await createPremiumMonthlyPayment(admin, premiumAccount);
    }
  }

  const validationError = await validatePaymentForPayme(admin, payload, payment, account, amountTiyin);
  if (validationError) {
    return buildRpcResponse(admin, payload, validationError, { paymentId: payment.id, externalTransactionId });
  }

  const existingByPayment = await getPaymentTransactionByPaymentId(admin, payment.id);
  if (existingByPayment && existingByPayment.external_transaction_id !== externalTransactionId) {
    if (existingByPayment.state === PAYME_STATE.CREATED && isTransactionExpired(existingByPayment)) {
      await expirePaymentTransaction(admin, payment, existingByPayment, payload as Record<string, unknown>);
    }

    return buildRpcResponse(admin, payload, accountBusyError(payload.id), {
      paymentId: payment.id,
      externalTransactionId,
      state: existingByPayment.state,
    });
  }

  const createTime = Date.now();
  const transaction: PaymentTransactionRecord = {
    id: null,
    payment_id: payment.id,
    external_transaction_id: externalTransactionId,
    payme_transaction_id: externalTransactionId,
    payme_id: externalTransactionId,
    external_receipt_id: payment.external_receipt_id,
    account,
    amount_tiyin: amountTiyin,
    state: PAYME_STATE.CREATED,
    reason: null,
    payme_time: paymeTime,
    create_time: createTime,
    perform_time: 0,
    cancel_time: 0,
    raw_request: payload as Record<string, unknown>,
  };

  await upsertPaymentTransaction(admin, transaction);
  await (admin.from("payments") as any)
    .update({
      provider: "payme",
      external_transaction_id: externalTransactionId,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  return buildRpcResponse(admin, payload, successBody(payload.id, createResult(transaction)), {
    paymentId: payment.id,
    externalTransactionId,
    state: PAYME_STATE.CREATED,
  });
}

async function handlePerformTransaction(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest
): Promise<PaymeRpcResponseBody> {
  const params = asObject(payload.params);
  const externalTransactionId = asString(params.id);
  const transaction = externalTransactionId
    ? await getPaymentTransactionByExternalId(admin, externalTransactionId)
    : null;

  if (!transaction) {
    return buildRpcResponse(admin, payload, transactionNotFoundError(payload.id), { externalTransactionId });
  }

  const payment = await getPaymentById(admin, transaction.payment_id);
  if (!payment) {
    return buildRpcResponse(admin, payload, transactionNotFoundError(payload.id), {
      paymentId: transaction.payment_id,
      externalTransactionId,
      state: transaction.state,
    });
  }

  if (transaction.state === PAYME_STATE.PERFORMED) {
    return buildRpcResponse(admin, payload, successBody(payload.id, performResult(transaction)), {
      paymentId: payment.id,
      externalTransactionId,
      state: PAYME_STATE.PERFORMED,
    });
  }

  if (transaction.state < 0) {
    return buildRpcResponse(admin, payload, cannotPerformError(payload.id), {
      paymentId: payment.id,
      externalTransactionId,
      state: transaction.state,
    });
  }

  if (isTransactionExpired(transaction)) {
    await expirePaymentTransaction(admin, payment, transaction, payload as Record<string, unknown>);
    return buildRpcResponse(admin, payload, cannotPerformError(payload.id, "Tranzaksiya muddati tugagan"), {
      paymentId: payment.id,
      externalTransactionId,
      state: PAYME_STATE.CANCELLED,
    });
  }

  const eligibility = await getUserPaymentEligibility(admin, payment.user_id);
  if (!eligibility.exists || !eligibility.active) {
    return buildRpcResponse(admin, payload, accountValidationError(payload.id, eligibility.data ?? "user_id"), {
      paymentId: payment.id,
      externalTransactionId,
      state: transaction.state,
    });
  }

  const performTime = Date.now();
  const paidAt = new Date(performTime).toISOString();
  const nextTransaction: PaymentTransactionRecord = {
    ...transaction,
    external_receipt_id: payment.external_receipt_id,
    state: PAYME_STATE.PERFORMED,
    reason: null,
    perform_time: performTime,
    raw_request: payload as Record<string, unknown>,
  };

  await upsertPaymentTransaction(admin, nextTransaction);
  await markPaymentPaid(admin, payment, externalTransactionId, payment.external_receipt_id, paidAt);
  await grantPaymentEntitlement(admin, {
    ...payment,
    status: "paid",
    paid_at: paidAt,
  });

  return buildRpcResponse(admin, payload, successBody(payload.id, performResult(nextTransaction)), {
    paymentId: payment.id,
    externalTransactionId,
    state: PAYME_STATE.PERFORMED,
  });
}

async function handleCancelTransaction(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest
): Promise<PaymeRpcResponseBody> {
  const params = asObject(payload.params);
  const externalTransactionId = asString(params.id);
  const reason = asNumber(params.reason) || null;
  const transaction = externalTransactionId
    ? await getPaymentTransactionByExternalId(admin, externalTransactionId)
    : null;

  if (!transaction) {
    return buildRpcResponse(admin, payload, transactionNotFoundError(payload.id), { externalTransactionId });
  }

  const payment = await getPaymentById(admin, transaction.payment_id);
  if (!payment) {
    return buildRpcResponse(admin, payload, transactionNotFoundError(payload.id), {
      paymentId: transaction.payment_id,
      externalTransactionId,
      state: transaction.state,
    });
  }

  if (transaction.state === PAYME_STATE.CANCELLED || transaction.state === PAYME_STATE.CANCELLED_AFTER_PERFORM) {
    return buildRpcResponse(admin, payload, successBody(payload.id, cancelResult(transaction)), {
      paymentId: payment.id,
      externalTransactionId,
      state: transaction.state,
    });
  }

  const cancelTime = Date.now();
  const nextState = transaction.state === PAYME_STATE.PERFORMED || payment.status === "paid"
    ? PAYME_STATE.CANCELLED_AFTER_PERFORM
    : PAYME_STATE.CANCELLED;
  const nextTransaction: PaymentTransactionRecord = {
    ...transaction,
    external_receipt_id: payment.external_receipt_id,
    state: nextState,
    reason,
    cancel_time: cancelTime,
    raw_request: payload as Record<string, unknown>,
  };

  await upsertPaymentTransaction(admin, nextTransaction);
  await markPaymentCancelled(admin, payment, externalTransactionId, reason, new Date(cancelTime).toISOString());

  if (transaction.state === PAYME_STATE.PERFORMED || payment.status === "paid") {
    await revokePaymentEntitlement(admin, payment);
  }

  return buildRpcResponse(admin, payload, successBody(payload.id, cancelResult(nextTransaction)), {
    paymentId: payment.id,
    externalTransactionId,
    state: nextState,
  });
}

async function handleCheckTransaction(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest
): Promise<PaymeRpcResponseBody> {
  const params = asObject(payload.params);
  const externalTransactionId = asString(params.id);
  console.log("[Payme CheckTransaction] lookup id:", externalTransactionId || "<empty>");
  const transaction = externalTransactionId
    ? await getPaymentTransactionByExternalId(admin, externalTransactionId)
    : null;

  if (!transaction) {
    return buildRpcResponse(admin, payload, transactionNotFoundError(payload.id), { externalTransactionId });
  }

  return buildRpcResponse(admin, payload, successBody(payload.id, checkResult(transaction)), {
    paymentId: transaction.payment_id,
    externalTransactionId,
    state: transaction.state,
  });
}

async function handleGetStatement(
  admin: SupabaseClient,
  payload: PaymeMerchantRequest
): Promise<PaymeRpcResponseBody> {
  const params = asObject(payload.params);
  const from = asNumber(params.from);
  const to = asNumber(params.to);
  const transactions = await getPaymentTransactionsForStatement(admin, from, to);

  return buildRpcResponse(
    admin,
    payload,
    successBody(payload.id, {
      transactions: transactions.map((transaction) => ({
        id: transaction.external_transaction_id,
        time: transaction.payme_time,
        amount: transaction.amount_tiyin,
        account: transaction.account,
        create_time: transaction.create_time,
        perform_time: transaction.perform_time,
        cancel_time: transaction.cancel_time,
        transaction: transaction.payment_id,
        state: transaction.state,
        reason: transaction.reason,
      })),
    })
  );
}

function sendJson(res: ServerlessResponse, statusCode: number, body: unknown): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(statusCode).json(body);
}

export default async function handler(req: ServerlessRequest, res: ServerlessResponse): Promise<void> {
  if (req.method === "GET") {
    sendJson(res, 200, {
      service: "payme-merchant",
      status: "ok",
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(
      res,
      405,
      errorBody(
        null,
        PAYME_ERROR.METHOD_NOT_POST,
        localizedMessage("Faqat POST so'rovi qabul qilinadi", "Метод запроса должен быть POST", "Only POST requests are allowed")
      )
    );
    return;
  }

  if (!isSupabasePaymentServerConfigured() || !isPaymeMerchantConfigured()) {
    sendJson(res, 200, errorBody(null, PAYME_ERROR.SYSTEM, "Merchant configuration error"));
    return;
  }

  if (!validatePaymeAuthorizationHeader(getHeader(req, "authorization"))) {
    sendJson(res, 200, errorBody(null, PAYME_ERROR.AUTH, "Insufficient privileges"));
    return;
  }

  let payload: PaymeMerchantRequest;
  try {
    payload = (await readJsonBody(req)) as PaymeMerchantRequest;
  } catch {
    sendJson(res, 200, errorBody(null, PAYME_ERROR.PARSE_ERROR, "Parse error"));
    return;
  }

  const method = payload.method?.trim() ?? "";
  if (!method || payload.params == null || typeof payload.params !== "object") {
    sendJson(res, 200, errorBody(payload.id, PAYME_ERROR.INVALID_REQUEST, "Invalid Request"));
    return;
  }

  try {
    const admin = createPaymentsAdminClient();
    let body: PaymeRpcResponseBody;

    switch (method) {
      case "CheckPerformTransaction":
        body = await handleCheckPerformTransaction(admin, payload);
        break;
      case "CreateTransaction":
        body = await handleCreateTransaction(admin, payload);
        break;
      case "PerformTransaction":
        body = await handlePerformTransaction(admin, payload);
        break;
      case "CancelTransaction":
        body = await handleCancelTransaction(admin, payload);
        break;
      case "CheckTransaction":
        body = await handleCheckTransaction(admin, payload);
        break;
      case "GetStatement":
        body = await handleGetStatement(admin, payload);
        break;
      default:
        body = await buildRpcResponse(
          admin,
          payload,
          errorBody(payload.id, PAYME_ERROR.METHOD_NOT_FOUND, "Method not found", method)
        );
        break;
    }

    sendJson(res, 200, body);
  } catch (error) {
    console.error("[Payme merchant] error:", error);
    sendJson(res, 200, errorBody(payload.id, PAYME_ERROR.SYSTEM, "System error"));
  }
}
