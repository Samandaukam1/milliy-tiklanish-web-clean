import { jsonResponse, sendTelegramGatewayCode, TelegramGatewayError } from "@/lib/server/telegramGateway";

export async function GET(): Promise<Response> {
  console.log("[telegram-gateway-send] GET route hit");
  return jsonResponse({ success: true, route: "/api/auth/telegram-gateway/send" }, 200);
}

export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[telegram-gateway-send] POST route hit");
    const body = (await request.json()) as {
      phone?: string;
      purpose?: "signup" | "register" | "recovery" | "change_phone";
      user_id?: string;
      current_password?: string;
    };
    console.log("[telegram-gateway-send] payload:", {
      phone: body.phone ?? null,
      purpose: body.purpose ?? null,
      user_id: body.user_id ?? null,
    });
    const result = await sendTelegramGatewayCode(body.phone, {
      purpose: body.purpose,
      user_id: body.user_id,
      current_password: body.current_password,
    });

    if (result.success) {
      return jsonResponse({ success: true, session_id: result.session_id, phone: result.phone }, 200);
    }

    return jsonResponse(result, 200);
  } catch (error) {
    if (error instanceof TelegramGatewayError) {
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[telegram-gateway-send] Unexpected error:", error);
    return jsonResponse({ success: false, error: "Telegram Gateway send failed" }, 500);
  }
}