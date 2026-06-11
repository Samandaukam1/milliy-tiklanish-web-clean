import { jsonResponse, sendTelegramGatewayCode, TelegramGatewayError } from "@/lib/server/telegramGateway";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      phone?: string;
      purpose?: "signup" | "register" | "recovery" | "change_phone";
      user_id?: string;
      current_password?: string;
    };
    const result = await sendTelegramGatewayCode(body.phone, {
      purpose: body.purpose,
      user_id: body.user_id,
      current_password: body.current_password,
    });

    if (!result.success) {
      return jsonResponse(result, 200);
    }

    return jsonResponse({
      success: result.success,
      session_id: result.session_id,
      phone: result.phone,
      purpose: result.purpose,
      ttl: result.ttl,
      expires_at: result.expires_at,
    });
  } catch (error) {
    if (error instanceof TelegramGatewayError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }

    console.error("[telegram-send] Unexpected error:", error);
    return jsonResponse({ error: "Telegram Gateway send failed" }, 500);
  }
}