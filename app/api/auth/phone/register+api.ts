import { jsonResponse, PhoneAuthError, registerPhoneAccount, type RegisterPhoneAccountInput } from "@/lib/server/phoneAuth";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as RegisterPhoneAccountInput;
    const user = await registerPhoneAccount(body);

    return jsonResponse({ success: true, user });
  } catch (error) {
    if (error instanceof PhoneAuthError) {
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[phone-register] Unexpected error:", error);
    return jsonResponse({ success: false, error: "Ro'yxatdan o'tish yakunlanmadi" }, 500);
  }
}