import { jsonResponse, PhoneAuthError, registerProfileAccount, type RegisterProfileAccountInput } from "@/lib/server/phoneAuth";

type RegisterRequestBody = RegisterProfileAccountInput & {
  interestIds?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  let rawInterests: unknown = [];
  let interests: Array<number | string> = [];

  try {
    const body = (await request.json()) as RegisterRequestBody;
    console.log("[register-api] body", body);

    rawInterests = body.interests ?? body.interest_ids ?? body.interestIds ?? body.selectedInterests ?? [];

    const numericInterests = Array.isArray(rawInterests)
      ? rawInterests
          .map((item) => Number(item))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];

    const fallbackInterests = Array.isArray(rawInterests)
      ? rawInterests
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];

    interests = numericInterests.length > 0 ? numericInterests : fallbackInterests;

    if (interests.length < 3) {
      return jsonResponse(
        {
          success: false,
          code: "interests_min",
          error: "Kamida 3 ta qiziqish tanlang",
          debug: {
            rawInterests,
            normalizedInterests: interests,
          },
        },
        400
      );
    }

    const user = await registerProfileAccount({
      ...body,
      interests,
      interest_ids: numericInterests.length > 0 ? numericInterests : body.interest_ids,
      interestIds: numericInterests.length > 0 ? numericInterests : body.interestIds,
    });

    return jsonResponse({ success: true, user });
  } catch (error) {
    if (error instanceof PhoneAuthError) {
      return jsonResponse(
        {
          success: false,
          code: error.code ?? "register_failed",
          error: error.message,
          debug: {
            rawInterests,
            normalizedInterests: interests,
          },
        },
        error.status
      );
    }

    console.error("[auth-register] Unexpected error:", error);
    return jsonResponse(
      {
        success: false,
        code: "register_failed",
        error: "Registration failed",
        debug: {
          rawInterests,
          normalizedInterests: interests,
        },
      },
      500
    );
  }
}