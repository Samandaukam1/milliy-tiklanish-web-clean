import { jsonResponse, registerWithVerifiedPhone, TelegramGatewayError, type RegisterAccountInput } from "@/lib/server/telegramGateway";

export async function GET(): Promise<Response> {
  console.log("[register-complete] GET route hit");
  return jsonResponse({ success: true, route: "/api/auth/register-complete" }, 200);
}

export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[register-complete] POST route hit");
    const body = (await request.json()) as RegisterAccountInput;
    console.log("[register-complete] payload:", {
      session_id: typeof body.session_id === "string" ? body.session_id : null,
      login: typeof body.login === "string" ? body.login : null,
      has_avatar_url: typeof body.avatar_url === "string" && body.avatar_url.length > 0,
    });
    const profile = await registerWithVerifiedPhone(body);

    return jsonResponse({ success: true, profile });
  } catch (error) {
    if (error instanceof TelegramGatewayError) {
      const reason = error.code || null;
      if (reason === "login_taken") {
        return jsonResponse({ success: false, error: error.message, reason: "login_taken" }, error.status);
      }
      if (reason === "phone_taken" || reason === "phone_exists") {
        return jsonResponse({ success: false, error: error.message, reason: "phone_taken" }, error.status);
      }
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[register-complete] Unexpected error:", error);
    return jsonResponse({ success: false, error: "Registration failed" }, 500);
  }
}