import {
  buildPaymentStatusPayload,
  createPaymentsAdminClient,
  getPaymentById,
  isSupabasePaymentServerConfigured,
} from "../../../lib/server/payme";

type ServerlessRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ServerlessResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ServerlessResponse;
  json(body: unknown): void;
};

function sendJson(res: ServerlessResponse, statusCode: number, body: unknown): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(statusCode).json(body);
}

function firstQueryValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function handler(req: ServerlessRequest, res: ServerlessResponse): Promise<void> {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!isSupabasePaymentServerConfigured()) {
    sendJson(res, 503, { error: "Server configuration error" });
    return;
  }

  const paymentId = firstQueryValue(req.query?.id);
  if (!paymentId) {
    sendJson(res, 400, { error: "Missing payment id" });
    return;
  }

  try {
    const admin = createPaymentsAdminClient();
    const payment = await getPaymentById(admin, paymentId);
    if (!payment) {
      sendJson(res, 404, { error: "Payment not found" });
      return;
    }

    sendJson(res, 200, await buildPaymentStatusPayload(admin, payment));
  } catch (error) {
    console.error("[Payme status] error:", error);
    sendJson(res, 500, { error: "Internal server error" });
  }
}
