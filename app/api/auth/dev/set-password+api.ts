/**
 * DEV-ONLY password reset endpoint.
 * REMOVE or DISABLE this file before production deployment.
 * Protected by DEV_SECRET env variable.
 */
import { jsonResponse, PhoneAuthError, setPasswordForLogin } from "@/lib/server/phoneAuth";

const DEV_SECRET = process.env.DEV_SECRET ?? "";

export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return jsonResponse({ error: "Not found" }, 404);
  }

  return jsonResponse({
    ok: true,
    route: "dev/set-password",
    note: "POST with { secret, login, password } to reset a user password (dev only)",
  });
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return jsonResponse({ error: "Not found" }, 404);
  }

  try {
    const body = (await request.json()) as { secret?: string; login?: string; password?: string };

    if (!DEV_SECRET || body.secret !== DEV_SECRET) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    if (!body.login || !body.password) {
      return jsonResponse({ success: false, error: "login and password required" }, 400);
    }

    const profile = await setPasswordForLogin(body.login, body.password);

    return jsonResponse({ success: true, profile });
  } catch (error) {
    if (error instanceof PhoneAuthError) {
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("[dev/set-password] error:", error);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
}
