import { jsonResponse, PhoneAuthError, sendPhoneVerificationCode } from "@/lib/server/phoneAuth";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { phone?: string; identifier?: string; purpose?: string };
    const session = await sendPhoneVerificationCode(body);

    return jsonResponse({ success: true, ...session });
  } catch (error) {
    if (error instanceof PhoneAuthError) {
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[phone-send] Unexpected error:", error);
    return jsonResponse({ success: false, error: "SMS kod yuborilmadi" }, 500);
  }
}