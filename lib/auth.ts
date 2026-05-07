import { fetchAuthJson } from "@/lib/authApi";
import { sendTelegramVerificationCode, verifyTelegramCode, type TelegramPhoneSession } from "@/lib/telegramAuth";
import type { UserProfile } from "@/lib/types";

type AuthUserResponse = {
  success?: boolean;
  user?: UserProfile;
  error?: string;
  code?: string;
};

export type RegisterUserInput = {
  first_name: string;
  last_name: string;
  birth_date: string;
  login: string;
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

async function requestUser(path: string, payload: object, fallbackMessage: string): Promise<UserProfile> {
  const { response, body } = await fetchAuthJson<AuthUserResponse>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !body.user) {
    throw new Error(normalizeErrorMessage(body.error, fallbackMessage));
  }

  return body.user;
}

export async function registerUser(input: RegisterUserInput): Promise<UserProfile> {
  return requestUser("/api/auth/register", input, "Ro'yxatdan o'tish yakunlanmadi");
}

export async function loginUser(login: string, password: string): Promise<UserProfile> {
  return requestUser("/api/auth/login", { login, password }, "Login yoki parol noto'g'ri");
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