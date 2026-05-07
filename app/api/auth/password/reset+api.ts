import { jsonResponse, resetPasswordWithVerifiedPhone, TelegramGatewayError } from "@/lib/server/telegramGateway";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { session_id?: string; password?: string };
    const user = await resetPasswordWithVerifiedPhone(body.session_id, body.password);

    return jsonResponse({ success: true, user });
  } catch (error) {
    if (error instanceof TelegramGatewayError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }

    console.error("[auth-password-reset] Unexpected error:", error);
    return jsonResponse({ error: "Password reset failed" }, 500);
  }
}