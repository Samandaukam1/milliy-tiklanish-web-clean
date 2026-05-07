import { jsonResponse, TelegramGatewayError, verifyTelegramGatewayCode } from "@/lib/server/telegramGateway";

export async function GET(): Promise<Response> {
  console.log("[telegram-gateway-verify] GET route hit");
  return jsonResponse({ success: true, route: "/api/auth/telegram-gateway/verify" }, 200);
}

export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[telegram-gateway-verify] POST route hit");
    const body = (await request.json()) as { session_id?: string; code?: string; phone?: string };
    console.log("VERIFY BODY:", body);

    if (!body.session_id && !body.phone) {
      return jsonResponse({ success: false, error: "session_id_missing", reason: "session_id_missing" }, 400);
    }

    const result = await verifyTelegramGatewayCode(body.session_id, body.code, body.phone);

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    if (error instanceof TelegramGatewayError) {
      const reason = error.code || error.message;
      if (reason === "session_id_missing" || reason === "session_not_found" || reason === "request_id_missing") {
        return jsonResponse({ success: false, error: reason, reason }, error.status);
      }

      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[telegram-gateway-verify] Unexpected error:", error);
    return jsonResponse({ success: false, error: "Telegram Gateway verify failed" }, 500);
  }
}