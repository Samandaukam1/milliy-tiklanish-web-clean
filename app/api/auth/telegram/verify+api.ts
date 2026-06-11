import { jsonResponse, TelegramGatewayError, verifyTelegramGatewayCode } from "@/lib/server/telegramGateway";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { session_id?: string; code?: string; phone?: string };
    const result = await verifyTelegramGatewayCode(body.session_id, body.code, body.phone);

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    if (error instanceof TelegramGatewayError) {
      if (error.code === "session_not_found" || error.message === "session_not_found") {
        return jsonResponse({ success: false, error: "session_not_found" }, error.status);
      }

      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }

    console.error("[telegram-verify] Unexpected error:", error);
    return jsonResponse({ error: "Telegram Gateway verify failed" }, 500);
  }
}