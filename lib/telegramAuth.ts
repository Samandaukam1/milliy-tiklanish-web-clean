import { fetchAuthJson } from "@/lib/authApi";
import type { UserProfile } from "@/lib/types";

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
  const { response: res, body } = await fetchAuthJson<TelegramSendResponse>("/api/auth/telegram-gateway/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone,
      purpose: options?.purpose,
      user_id: options?.user_id,
      current_password: options?.current_password,
    }),
  });

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
  const { response: res, body } = await fetchAuthJson<TelegramVerifyResponse>("/api/auth/telegram-gateway/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      code,
      phone,
    }),
  });

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
  return requestUser("/api/auth/register-complete", input, "Ro'yxatdan o'tish yakunlanmadi");
}

export async function loginWithTelegramPassword(login: string, password: string): Promise<UserProfile> {
  return requestUser("/api/auth/login", { login, password }, "Kirish amalga oshmadi");
}

export async function resetTelegramPassword(sessionId: string, password: string): Promise<UserProfile> {
  return requestUser(
    "/api/auth/password/reset",
    {
      session_id: sessionId,
      password,
    },
    "Parol tiklanmadi"
  );
}