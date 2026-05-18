import { fetchAuthJson } from "@/lib/authApi";
import { supabase, loadSupabaseProfile, lookupEmailByLogin } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

// Returns true when the error comes from a missing server API endpoint.
function isApiUnavailable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("vaqtincha mavjud emas") ||
    msg.includes("API endpoint") ||
    msg.includes("Server konfiguratsiya") ||
    msg.includes("server konfiguratsiya") ||
    msg.includes("server xatoligi")
  );
}

export type TelegramVerificationPurpose = "signup" | "register" | "recovery" | "change_phone";

type TelegramSendResponse = {
  success?: boolean;
  reason?: "phone_exists";
  message?: string;
  session_id?: string;
  phone?: string;
  purpose?: TelegramVerificationPurpose;
  ttl?: number;
  expires_at?: string;
  error?: string;
  code?: string;
};

type TelegramVerifyResponse = {
  success?: boolean;
  phone_verified?: boolean;
  next_step?: "reset_password" | "phone_changed";
  session_id?: string;
  phone?: string;
  user?: UserProfile;
  error?: string;
  code?: string;
};

type TelegramUserResponse = {
  success?: boolean;
  user?: UserProfile;
  error?: string;
  code?: string;
};

export type TelegramPhoneSession = {
  session_id: string;
  phone: string;
  purpose: TelegramVerificationPurpose;
  ttl: number;
  expires_at?: string;
};

export type TelegramSendResult =
  | {
      success: true;
      session: TelegramPhoneSession;
    }
  | {
      success: false;
      reason: "phone_exists";
      message: string;
      phone: string;
    };

export type TelegramVerifyResult = {
  phone_verified: true;
  session_id: string;
  phone: string;
  next_step?: "reset_password" | "phone_changed";
  user?: UserProfile;
};

type SendCodeOptions = {
  purpose?: TelegramVerificationPurpose;
  user_id?: string;
  current_password?: string;
};

type RegisterInput = {
  session_id: string;
  phone: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  login: string;
  password: string;
  avatar_url?: string | null;
};

export async function sendTelegramVerificationCode(phone: string, options?: SendCodeOptions): Promise<TelegramSendResult> {
  let res: Response;
  let body: TelegramSendResponse;
  try {
    const result = await fetchAuthJson<TelegramSendResponse>("/api/auth/telegram-gateway/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        purpose: options?.purpose,
        user_id: options?.user_id,
        current_password: options?.current_password,
      }),
    });
    res = result.response;
    body = result.body;
  } catch (error) {
    if (isApiUnavailable(error)) {
      throw new Error("Telegram orqali tasdiqlash hozircha veb-sayt orqali mavjud emas. Iltimos, ilovamizdan foydalaning.");
    }
    throw error;
  }

  if (!res.ok) {
    throw new Error(body.error || "Telegram kodi yuborilmadi");
  }

  if (body.success === false && body.reason === "phone_exists" && body.phone) {
    return {
      success: false,
      reason: body.reason,
      message: body.message || "Bu raqamdan avval foydalanilgan. Agar parolni tiklamoqchi bo'lsangiz, Parolni tiklash bo'limiga o'ting.",
      phone: body.phone,
    };
  }

  if (!body.session_id || !body.phone) {
    throw new Error(body.error || "Telegram kodi yuborilmadi");
  }

  console.log("[telegram-auth] SEND RESPONSE session_id:", body.session_id);

  return {
    success: true,
    session: {
      session_id: body.session_id,
      phone: body.phone,
      purpose: body.purpose ?? options?.purpose ?? "signup",
      ttl: body.ttl ?? 300,
      expires_at: body.expires_at,
    },
  };
}

export async function verifyTelegramCode(sessionId: string, code: string, phone?: string): Promise<TelegramVerifyResult> {
  console.log("[telegram-auth] VERIFY REQUEST:", { session_id: sessionId, phone, code });
  let res: Response;
  let body: TelegramVerifyResponse;
  try {
    const result = await fetchAuthJson<TelegramVerifyResponse>("/api/auth/telegram-gateway/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, code, phone }),
    });
    res = result.response;
    body = result.body;
  } catch (error) {
    if (isApiUnavailable(error)) {
      throw new Error("Telegram orqali tasdiqlash hozircha veb-sayt orqali mavjud emas. Iltimos, ilovamizdan foydalaning.");
    }
    throw error;
  }

  if (!res.ok || !body.phone_verified || !body.session_id || !body.phone) {
    throw new Error(body.error || "Tasdiqlash kodi tekshirilmadi");
  }

  if (body.next_step === "phone_changed" && !body.user) {
    throw new Error("Telefon yangilangan foydalanuvchi qaytmadi");
  }

  return {
    phone_verified: body.phone_verified,
    next_step: body.next_step,
    session_id: body.session_id,
    phone: body.phone,
    user: body.user,
  };
}

async function requestUser(path: string, payload: object, fallbackMessage: string): Promise<UserProfile> {
  const { response: res, body } = await fetchAuthJson<TelegramUserResponse>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !body.user) {
    throw new Error(body.error || fallbackMessage);
  }

  return body.user;
}

export async function registerTelegramAccount(input: RegisterInput): Promise<UserProfile> {
  try {
    return await requestUser("/api/auth/register-complete", input, "Ro'yxatdan o'tish yakunlanmadi");
  } catch (error) {
    if (isApiUnavailable(error)) {
      throw new Error("Telefon orqali ro'yxatdan o'tish hozircha veb-sayt orqali mavjud emas. Iltimos, ilovamizdan foydalaning.");
    }
    throw error;
  }
}

export async function loginWithTelegramPassword(login: string, password: string): Promise<UserProfile> {
  console.log("[auth] using Supabase direct auth");

  // Resolve the stored email from the username in profiles table.
  const email = await lookupEmailByLogin(login);
  if (!email) {
    throw new Error("Kirish amalga oshmadi");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.user) {
    const msg = error?.message ?? "";
    throw new Error(
      /invalid login credentials|invalid password|email not confirmed/i.test(msg)
        ? "Kirish amalga oshmadi"
        : msg || "Kirish amalga oshmadi"
    );
  }

  const profile = await loadSupabaseProfile(data.session.user.id);
  if (!profile) throw new Error("Profil topilmadi");

  console.log("[profile] loaded from Supabase");
  return profile;
}

export async function resetTelegramPassword(sessionId: string, password: string): Promise<UserProfile> {
  try {
    return await requestUser(
      "/api/auth/password/reset",
      { session_id: sessionId, password },
      "Parol tiklanmadi"
    );
  } catch (error) {
    if (isApiUnavailable(error)) {
      // Fallback: update via Supabase auth if a session is active
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (!updateError) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const profile = await loadSupabaseProfile(user.id);
          if (profile) return profile;
        }
      }
      throw new Error("Parol yangilash hozircha veb-sayt orqali mavjud emas. Iltimos, ilovamizdan foydalaning.");
    }
    throw error;
  }
}