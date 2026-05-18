import { sendTelegramVerificationCode, verifyTelegramCode, type TelegramPhoneSession } from "@/lib/telegramAuth";
import { supabase, loadSupabaseProfile, upsertSupabaseProfile, lookupEmailByLogin } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

export type RegisterUserInput = {
  first_name: string;
  last_name: string;
  birth_date: string;
  login: string;
  /** Real email address — used for Supabase Auth signUp. */
  email: string;
  password: string;
  interests: string[];
  avatar_url?: string | null;
};

type PhoneLinkInput = {
  phone: string;
  userId: string;
  currentPassword: string;
};

function normalizeErrorMessage(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function normalizeLoginValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32);
}

export function normalizePhoneValue(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "+998";
  }

  if (digits.startsWith("998")) {
    return `+${digits.slice(0, 12)}`;
  }

  return `+998${digits.slice(0, 9)}`;
}

export function formatDateForApi(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function validatePassword(value: string): string | null {
  if (value.length < 6) {
    return "Parol kamida 6 ta belgidan iborat bo'lishi kerak";
  }

  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "Parolda kamida bitta harf va bitta raqam bo'lishi kerak";
  }

  return null;
}

async function saveUserInterests(userId: string, interests: string[]): Promise<void> {
  if (interests.length === 0) return;

  await (supabase.from("user_interests") as any).delete().eq("user_id", userId);

  const tryInsert = async (column: string): Promise<boolean> => {
    const rows = interests.map((id) => ({ user_id: userId, [column]: id, score: 10 }));
    const { error } = await (supabase.from("user_interests") as any).insert(rows);
    return !error;
  };

  (await tryInsert("interest_id")) ||
    (await tryInsert("category_id")) ||
    (await tryInsert("category"));
}

export async function registerUser(input: RegisterUserInput): Promise<UserProfile> {
  console.log("[auth] using Supabase direct auth");

  if (!input.login || !input.password) {
    throw new Error("Login va parolni kiriting");
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Email manzil noto'g'ri. Iltimos haqiqiy email kiriting.");
  }

  const fullName = `${input.first_name.trim()} ${input.last_name.trim()}`.trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        login: input.login,
        full_name: fullName,
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
      },
    },
  });

  if (error) {
    const msg = error.message ?? "";
    if (/already registered|already been registered|User already registered/i.test(msg)) {
      throw new Error("Bu email yoki login band yoki avval ishlatilgan");
    }
    if (/invalid email|email.*invalid/i.test(msg)) {
      throw new Error("Email manzil noto'g'ri. Iltimos haqiqiy email kiriting.");
    }
    throw new Error(msg || "Ro'yxatdan o'tish yakunlanmadi");
  }

  // If email confirmation is required, data.session is null but data.user is set
  const authUser = data.user ?? data.session?.user;
  if (!authUser) {
    throw new Error("Ro'yxatdan o'tish yakunlandi. Profilingizga kirish uchun emailni tasdiqlang.");
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    phone: null,
    phone_verified: false,
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    full_name: fullName,
    name: fullName,
    birth_date: input.birth_date,
    login: input.login,
    email,
    avatar_url: input.avatar_url ?? null,
    provider: "credentials",
    subscription: "free",
    updated_at: now,
  };

  let profile = await upsertSupabaseProfile(authUser.id, patch);
  if (!profile) {
    profile = await loadSupabaseProfile(authUser.id);
  }
  if (!profile) {
    throw new Error("Profil yaratib bo'lmadi");
  }

  // Best-effort: save interests without blocking registration
  await saveUserInterests(authUser.id, input.interests).catch((err) => {
    console.warn("[auth] Could not save interests:", err);
  });

  console.log("[profile] loaded from Supabase");
  return profile;
}

export async function loginUser(login: string, password: string): Promise<UserProfile> {
  console.log("[auth] using Supabase direct auth");

  // Resolve the real Supabase Auth email from the username stored in profiles.
  const email = await lookupEmailByLogin(login);
  if (!email) {
    // No profile found for this login — surface generic message to avoid enumeration.
    throw new Error("Login yoki parol noto'g'ri");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.user) {
    const msg = error?.message ?? "";
    throw new Error(
      /invalid login credentials|invalid password|email not confirmed/i.test(msg)
        ? "Login yoki parol noto'g'ri"
        : msg || "Login yoki parol noto'g'ri"
    );
  }

  const profile = await loadSupabaseProfile(data.session.user.id);
  if (!profile) {
    throw new Error("Profil topilmadi");
  }

  console.log("[profile] loaded from Supabase");
  return profile;
}

export async function sendPhoneLinkCode(input: PhoneLinkInput): Promise<TelegramPhoneSession> {
  const result = await sendTelegramVerificationCode(input.phone, {
    purpose: "change_phone",
    user_id: input.userId,
    current_password: input.currentPassword,
  });

  if (!result.success) {
    throw new Error(normalizeErrorMessage(result.message, "Telefon raqami biriktirilmadi"));
  }

  return result.session;
}

export async function verifyPhoneLinkCode(sessionId: string, code: string, phone?: string): Promise<UserProfile> {
  const result = await verifyTelegramCode(sessionId, code, phone);
  if (result.next_step !== "phone_changed" || !result.user) {
    throw new Error("Telefon raqami biriktirilmadi");
  }

  return result.user;
}