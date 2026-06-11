import { fetchAuthJson } from "@/lib/authApi";
import { supabase, loadSupabaseProfile, lookupEmailByLogin } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

// Helper: returns true when the error comes from a missing server API endpoint.
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
  let res: Response;
  let body: PhoneSendResponse;
  try {
    const result = await fetchAuthJson<PhoneSendResponse>("/api/auth/phone/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    res = result.response;
    body = result.body;
  } catch (error) {
    if (isApiUnavailable(error)) {
      throw new Error("SMS tasdiqlash hozircha veb-sayt orqali mavjud emas. Iltimos, ilovamizdan foydalaning.");
    }
    throw error;
  }

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
  let res: Response;
  let body: PhoneVerifyResponse;
  try {
    const result = await fetchAuthJson<PhoneVerifyResponse>("/api/auth/phone/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, code }),
    });
    res = result.response;
    body = result.body;
  } catch (error) {
    if (isApiUnavailable(error)) {
      throw new Error("SMS tasdiqlash hozircha veb-sayt orqali mavjud emas. Iltimos, ilovamizdan foydalaning.");
    }
    throw error;
  }

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
  try {
    return await requestUser("/api/auth/phone/register", input, "Ro'yxatdan o'tish yakunlanmadi");
  } catch (error) {
    if (isApiUnavailable(error)) {
      throw new Error("Telefon orqali ro'yxatdan o'tish hozircha veb-sayt orqali mavjud emas. Iltimos, ilovamizdan foydalaning.");
    }
    throw error;
  }
}

export async function loginWithPassword(login: string, password: string): Promise<UserProfile> {
  console.log("[auth] using Supabase direct auth");

  // Resolve the stored email from the username in profiles table.
  const email = await lookupEmailByLogin(login);
  if (!email) {
    throw new Error("Tizimga kirish amalga oshmadi");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.user) {
    const msg = error?.message ?? "";
    throw new Error(
      /invalid login credentials|invalid password|email not confirmed/i.test(msg)
        ? "Tizimga kirish amalga oshmadi"
        : msg || "Tizimga kirish amalga oshmadi"
    );
  }

  const profile = await loadSupabaseProfile(data.session.user.id);
  if (!profile) throw new Error("Profil topilmadi");

  console.log("[profile] loaded from Supabase");
  return profile;
}

export async function resetPhonePassword(sessionId: string, password: string): Promise<UserProfile> {
  try {
    return await requestUser(
      "/api/auth/phone/password/reset",
      { session_id: sessionId, password },
      "Parol yangilanmadi"
    );
  } catch (error) {
    if (isApiUnavailable(error)) {
      // Fallback: if there's an active Supabase session, update password there
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