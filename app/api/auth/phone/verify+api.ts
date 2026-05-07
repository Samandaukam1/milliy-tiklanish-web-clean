import { jsonResponse, PhoneAuthError, verifyPhoneCode } from "@/lib/server/phoneAuth";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { session_id?: string; code?: string };
    const result = await verifyPhoneCode(body.session_id, body.code);

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    if (error instanceof PhoneAuthError) {
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[phone-verify] Unexpected error:", error);
    return jsonResponse({ success: false, error: "Tasdiqlash kodi tekshirilmadi" }, 500);
  }
}