import { jsonResponse, loginWithPassword, PhoneAuthError } from "@/lib/server/phoneAuth";

export async function GET(): Promise<Response> {
  return jsonResponse({ ok: true, route: "auth login" });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { login?: string; password?: string };
    console.log("[auth-login] Attempt for login:", body.login ?? "(empty)");

    const user = await loginWithPassword(body.login, body.password);
    console.log("[auth-login] Success for login:", body.login);

    return jsonResponse({ success: true, user });
  } catch (error) {
    if (error instanceof PhoneAuthError) {
      console.warn("[auth-login] PhoneAuthError:", error.status, error.message, error.code);
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[auth-login] Unexpected error:", error);
    return jsonResponse({ success: false, error: "Login amalga oshmadi" }, 500);
  }
}