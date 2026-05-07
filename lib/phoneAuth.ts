import { fetchAuthJson } from "@/lib/authApi";
import type { UserProfile } from "@/lib/types";

export type PhoneVerificationPurpose = "signup" | "recovery";

type PhoneSendResponse = {
  success?: boolean;
  session_id?: string;
  phone?: string;
  purpose?: PhoneVerificationPurpose;
  ttl?: number;
  expires_at?: string;
  review_bypass?: boolean;
  user?: UserProfile;
  error?: string;
  code?: string;
};

type PhoneVerifyResponse = {
  success?: boolean;
  phone_verified?: boolean;
  next_step?: "login" | "reset_password";
  session_id?: string;
  phone?: string;
  message?: string;
  error?: string;
  code?: string;
};

type PhoneUserResponse = {
  success?: boolean;
  user?: UserProfile;
  error?: string;
  code?: string;
};

export type PhoneVerificationSession = {
  session_id: string;
  phone: string;
  purpose: PhoneVerificationPurpose;
  ttl: number;
  expires_at?: string;
};

export type ReviewBypassSession = PhoneVerificationSession & {
  review_bypass: true;
  user: UserProfile;
};

export type PhoneVerifyResult = {
  phone_verified: true;
  session_id: string;
  phone: string;
  next_step?: "login" | "reset_password";
  message?: string;
};

type SendPhoneCodeInput = {
  phone?: string;
  identifier?: string;
  purpose?: PhoneVerificationPurpose;
};

type RegisterPhoneInput = {
  session_id: string;
  phone: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  login: string;
  password: string;
  avatar_url?: string | null;
};

export async function sendPhoneVerificationCode(input: SendPhoneCodeInput): Promise<PhoneVerificationSession | ReviewBypassSession> {
  const { response: res, body } = await fetchAuthJson<PhoneSendResponse>(
    "/api/auth/phone/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  if (!res.ok || !body.session_id || !body.phone) {
    throw new Error(body.error || "SMS kod yuborilmadi");
  }

  if (body.review_bypass && body.user) {
    return {
      session_id: body.session_id,
      phone: body.phone,
      purpose: body.purpose ?? input.purpose ?? "signup",
      ttl: body.ttl ?? 300,
      expires_at: body.expires_at,
      review_bypass: true,
      user: body.user,
    };
  }

  return {
    session_id: body.session_id,
    phone: body.phone,
    purpose: body.purpose ?? input.purpose ?? "signup",
    ttl: body.ttl ?? 300,
    expires_at: body.expires_at,
  };
}

export async function verifyPhoneCode(sessionId: string, code: string): Promise<PhoneVerifyResult> {
  const { response: res, body } = await fetchAuthJson<PhoneVerifyResponse>(
    "/api/auth/phone/verify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId, code }),
    }
  );

  if (!res.ok || !body.phone_verified || !body.session_id || !body.phone) {
    throw new Error(body.error || "Tasdiqlash kodi tekshirilmadi");
  }

  return {
    phone_verified: body.phone_verified,
    next_step: body.next_step,
    session_id: body.session_id,
    phone: body.phone,
    message: body.message,
  };
}

async function requestUser(path: string, payload: object, fallbackMessage: string): Promise<UserProfile> {
  const { response: res, body } = await fetchAuthJson<PhoneUserResponse>(
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok || !body.user) {
    throw new Error(body.error || fallbackMessage);
  }

  return body.user;
}

export async function registerPhoneAccount(input: RegisterPhoneInput): Promise<UserProfile> {
  return requestUser("/api/auth/phone/register", input, "Ro'yxatdan o'tish yakunlanmadi");
}

export async function loginWithPassword(login: string, password: string): Promise<UserProfile> {
  return requestUser("/api/auth/login", { login, password }, "Tizimga kirish amalga oshmadi");
}

export async function resetPhonePassword(sessionId: string, password: string): Promise<UserProfile> {
  return requestUser(
    "/api/auth/phone/password/reset",
    {
      session_id: sessionId,
      password,
    },
    "Parol yangilanmadi"
  );
}