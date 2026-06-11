import { jsonResponse, PhoneAuthError, resetPasswordWithVerifiedPhone } from "@/lib/server/phoneAuth";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { session_id?: string; password?: string };
    const user = await resetPasswordWithVerifiedPhone(body.session_id, body.password);

    return jsonResponse({ success: true, user });
  } catch (error) {
    if (error instanceof PhoneAuthError) {
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[phone-password-reset] Unexpected error:", error);
    return jsonResponse({ success: false, error: "Parol tiklanmadi" }, 500);
  }
}