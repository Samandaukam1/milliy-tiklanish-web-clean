import {
  buildPaymeReceiptDetail,
  createPaymentsAdminClient,
  getPaymentById,
  getPaymentTransactionByExternalId,
  getPaymentTransactionByPaymentId,
  grantPaymentEntitlement,
  isPaymeMerchantConfigured,
  isSupabasePaymentServerConfigured,
  isTransactionExpired,
  markPaymentCancelled,
  markPaymentPaid,
  paymeError,
  paymeSuccess,
  PAYME_ERROR,
  PAYME_STATE,
  revokePaymentEntitlement,
  upsertPaymentTransaction,
  validatePaymentAccount,
  validatePaymeAuthorizationHeader,
} from "@/lib/server/payme";

type PaymeMerchantRequest = {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown> | null;
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
  return Number.isFinite(parsed) ? parsed : 0;
}

function localizedMessage(uz: string, ru = uz, en = uz) {
  return { uz, ru, en };
}

function buildAccountValidationError(id: string | number | null | undefined, fieldName: string) {
  return paymeError(
    id,
    PAYME_ERROR.ACCOUNT_INVALID,
    localizedMessage(
      "Foydalanuvchi ma'lumotlari noto'g'ri",
      "Неверные данные пользователя",
      "Invalid account data"
    ),
    fieldName
  );
}

function buildInvalidAmountError(id: string | number | null | undefined) {
  return paymeError(
    id,
    PAYME_ERROR.INVALID_AMOUNT,
    localizedMessage("Noto'g'ri summa", "Неверная сумма", "Invalid amount")
  );
}

function buildCannotPerformError(id: string | number | null | undefined) {
  return paymeError(
    id,
    PAYME_ERROR.CANNOT_PERFORM,
    localizedMessage(
      "Operatsiyani bajarib bo'lmaydi",
      "Невозможно выполнить операцию",
      "Cannot perform operation"
    )
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isSupabasePaymentServerConfigured() || !isPaymeMerchantConfigured()) {
    return paymeError(null, PAYME_ERROR.SYSTEM, "Merchant configuration error");
  }

  if (!validatePaymeAuthorizationHeader(request.headers.get("authorization"))) {
    return paymeError(null, PAYME_ERROR.AUTH, "Insufficient privileges");
  }

  let payload: PaymeMerchantRequest;
  try {
    payload = (await request.json()) as PaymeMerchantRequest;
  } catch {
    return paymeError(null, PAYME_ERROR.INVALID_REQUEST, "Invalid Request");
  }

  const rpcId = payload.id ?? null;
  const method = payload.method?.trim() ?? "";
  const params = asObject(payload.params);

  try {
    const admin = createPaymentsAdminClient();

    if (method === "CheckPerformTransaction") {
      const amountTiyin = asNumber(params.amount);
      const account = asObject(params.account);
      const paymentId = asString(account.payment_id);
      const payment = paymentId ? await getPaymentById(admin, paymentId) : null;

      if (!payment) {
        return buildAccountValidationError(rpcId, "payment_id");
      }

      const invalidField = validatePaymentAccount(payment, account);
      if (invalidField) {
        return buildAccountValidationError(rpcId, invalidField);
      }

      if (amountTiyin !== payment.amount_tiyin) {
        return buildInvalidAmountError(rpcId);
      }

      if (payment.status === "paid" || payment.status === "cancelled") {
        return buildCannotPerformError(rpcId);
      }

      return paymeSuccess(rpcId, {
        allow: true,
        additional: {
          payment_id: payment.id,
          type: payment.type,
        },
        detail: buildPaymeReceiptDetail(payment),
      });
    }

    if (method === "CreateTransaction") {
      const externalTransactionId = asString(params.id);
      const paymeTime = asNumber(params.time);
      const amountTiyin = asNumber(params.amount);
      const account = asObject(params.account);
      const paymentId = asString(account.payment_id);
      const payment = paymentId ? await getPaymentById(admin, paymentId) : null;

      if (!payment) {
        return buildAccountValidationError(rpcId, "payment_id");
      }

      const invalidField = validatePaymentAccount(payment, account);
      if (invalidField) {
        return buildAccountValidationError(rpcId, invalidField);
      }

      if (amountTiyin !== payment.amount_tiyin) {
        return buildInvalidAmountError(rpcId);
      }

      const existingByExternal = await getPaymentTransactionByExternalId(admin, externalTransactionId);
      if (existingByExternal) {
        return paymeSuccess(rpcId, {
          create_time: existingByExternal.create_time,
          transaction: existingByExternal.payment_id,
          state: existingByExternal.state,
        });
      }

      const existingByPayment = await getPaymentTransactionByPaymentId(admin, payment.id);
      if (existingByPayment && existingByPayment.external_transaction_id !== externalTransactionId) {
        return buildCannotPerformError(rpcId);
      }

      if (payment.status === "paid" || payment.status === "cancelled") {
        return buildCannotPerformError(rpcId);
      }

      const createTime = Date.now();
      await upsertPaymentTransaction(admin, {
        payment_id: payment.id,
        external_transaction_id: externalTransactionId,
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
      });

      await (admin.from("payments") as any)
        .update({
          provider: "payme",
          external_transaction_id: externalTransactionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      return paymeSuccess(rpcId, {
        create_time: createTime,
        transaction: payment.id,
        state: PAYME_STATE.CREATED,
      });
    }

    if (method === "PerformTransaction") {
      const externalTransactionId = asString(params.id);
      const transaction = externalTransactionId
        ? await getPaymentTransactionByExternalId(admin, externalTransactionId)
        : null;

      if (!transaction) {
        return paymeError(rpcId, PAYME_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
      }

      const payment = await getPaymentById(admin, transaction.payment_id);
      if (!payment) {
        return paymeError(rpcId, PAYME_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
      }

      if (transaction.state === PAYME_STATE.PERFORMED) {
        return paymeSuccess(rpcId, {
          transaction: payment.id,
          perform_time: transaction.perform_time,
          state: PAYME_STATE.PERFORMED,
        });
      }

      if (transaction.state < 0 || isTransactionExpired(transaction)) {
        return buildCannotPerformError(rpcId);
      }

      const performTime = Date.now();
      const paidAt = new Date(performTime).toISOString();
      await upsertPaymentTransaction(admin, {
        ...transaction,
        external_receipt_id: payment.external_receipt_id,
        state: PAYME_STATE.PERFORMED,
        reason: null,
        perform_time: performTime,
        raw_request: payload as Record<string, unknown>,
      });
      await markPaymentPaid(admin, payment, externalTransactionId, payment.external_receipt_id, paidAt);
      await grantPaymentEntitlement(admin, {
        ...payment,
        status: "paid",
        paid_at: paidAt,
      });

      return paymeSuccess(rpcId, {
        transaction: payment.id,
        perform_time: performTime,
        state: PAYME_STATE.PERFORMED,
      });
    }

    if (method === "CancelTransaction") {
      const externalTransactionId = asString(params.id);
      const reason = asNumber(params.reason) || null;
      const transaction = externalTransactionId
        ? await getPaymentTransactionByExternalId(admin, externalTransactionId)
        : null;

      if (!transaction) {
        return paymeError(rpcId, PAYME_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
      }

      const payment = await getPaymentById(admin, transaction.payment_id);
      if (!payment) {
        return paymeError(rpcId, PAYME_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
      }

      if (transaction.state === PAYME_STATE.CANCELLED || transaction.state === PAYME_STATE.CANCELLED_AFTER_PERFORM) {
        return paymeSuccess(rpcId, {
          transaction: payment.id,
          cancel_time: transaction.cancel_time,
          state: transaction.state,
        });
      }

      const cancelTime = Date.now();
      const nextState = transaction.state === PAYME_STATE.PERFORMED || payment.status === "paid"
        ? PAYME_STATE.CANCELLED_AFTER_PERFORM
        : PAYME_STATE.CANCELLED;

      await upsertPaymentTransaction(admin, {
        ...transaction,
        external_receipt_id: payment.external_receipt_id,
        state: nextState,
        reason,
        cancel_time: cancelTime,
        raw_request: payload as Record<string, unknown>,
      });

      await markPaymentCancelled(admin, payment, externalTransactionId, reason, new Date(cancelTime).toISOString());

      if (transaction.state === PAYME_STATE.PERFORMED || payment.status === "paid") {
        await revokePaymentEntitlement(admin, payment);
      }

      return paymeSuccess(rpcId, {
        transaction: payment.id,
        cancel_time: cancelTime,
        state: nextState,
      });
    }

    if (method === "CheckTransaction") {
      const externalTransactionId = asString(params.id);
      const transaction = externalTransactionId
        ? await getPaymentTransactionByExternalId(admin, externalTransactionId)
        : null;

      if (!transaction) {
        return paymeError(rpcId, PAYME_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found");
      }

      return paymeSuccess(rpcId, {
        create_time: transaction.create_time,
        perform_time: transaction.perform_time,
        cancel_time: transaction.cancel_time,
        transaction: transaction.payment_id,
        state: transaction.state,
        reason: transaction.reason,
      });
    }

    if (method === "GetStatement") {
      const from = asNumber(params.from);
      const to = asNumber(params.to);
      const { data, error } = await (admin.from("payment_transactions") as any)
        .select("*")
        .gte("payme_time", from)
        .lte("payme_time", to)
        .order("payme_time", { ascending: true });

      if (error) {
        console.error("[Payme merchant] GetStatement error:", error);
        return paymeError(rpcId, PAYME_ERROR.SYSTEM, "System error");
      }

      const rows = Array.isArray(data) ? data : [];
      const transactions = rows.map((row) => {
        const transaction = asObject(row);
        return {
          id: asString(transaction.external_transaction_id),
          time: asNumber(transaction.payme_time),
          amount: asNumber(transaction.amount_tiyin),
          account: asObject(transaction.account),
          create_time: asNumber(transaction.create_time),
          perform_time: asNumber(transaction.perform_time),
          cancel_time: asNumber(transaction.cancel_time),
          transaction: asString(transaction.payment_id),
          state: asNumber(transaction.state),
          reason: transaction.reason == null ? null : asNumber(transaction.reason),
        };
      });

      return paymeSuccess(rpcId, { transactions });
    }

    return paymeError(rpcId, PAYME_ERROR.METHOD_NOT_FOUND, "Method not found");
  } catch (error) {
    console.error("[Payme merchant] error:", error);
    return paymeError(rpcId, PAYME_ERROR.SYSTEM, "System error");
  }
}