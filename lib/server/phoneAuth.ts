import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { compareSync } from "bcryptjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildSubscriptionInfo, readSubscriptionInfo, upsertSubscriptionInfo } from "@/lib/server/subscriptions";
import type { SubscriptionInfo, UserProfile } from "@/lib/types";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

const CODE_LENGTH = 6;
const TTL_SECONDS = 300;
const PASSWORD_MIN_LENGTH = 6;
const MIN_INTEREST_COUNT = 3;
const PHONE_SESSIONS_TABLE = "phone_verification_sessions";
const PROFILE_AVATARS_BUCKET = process.env.SUPABASE_PROFILE_AVATARS_BUCKET ?? process.env.EXPO_PUBLIC_SUPABASE_PROFILE_AVATARS_BUCKET ?? "profile-avatars";
const EXISTING_PHONE_MESSAGE = "Bu raqamdan avval foydalanilgan. Login va parolingiz bilan kiring.";
const LOGIN_TAKEN_MESSAGE = "Bu login band yoki avval ishlatilgan";
const REVIEW_TEST_PHONE = "+998000000000";
const REVIEW_TEST_LOGIN = "review_998000000000";
const REVIEW_TEST_NAME = "App Review";
const PUBLIC_PROFILE_COLUMNS = "id, full_name, role, phone, phone_verified, first_name, last_name, birth_date, login, avatar_url, provider, subscription, created_at, updated_at";
const PRIVATE_PROFILE_COLUMNS = `${PUBLIC_PROFILE_COLUMNS}, password_hash`;
const REQUIRED_PROFILE_AUTH_COLUMNS = [
  "phone",
  "phone_verified",
  "first_name",
  "last_name",
  "birth_date",
  "login",
  "password_hash",
  "avatar_url",
  "provider",
] as const;

type JsonBody = Record<string, unknown>;
type PhoneAuthPurpose = "signup" | "recovery";

type SessionRow = {
  id: string;
  phone: string;
  request_id: string;
  purpose: PhoneAuthPurpose;
  status: string;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
  profile_id?: string | null;
};

type PrivateProfileRow = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  phone?: string | null;
  phone_verified?: boolean | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  login?: string | null;
  avatar_url?: string | null;
  provider?: string | null;
  subscription?: string | null;
  created_at: string;
  updated_at: string;
  password_hash?: string | null;
};

type SchemaErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

type SendCodeInput = {
  phone?: unknown;
  identifier?: unknown;
  purpose?: unknown;
};

export type PhoneVerificationSession = {
  session_id: string;
  phone: string;
  purpose: PhoneAuthPurpose;
  ttl: number;
  expires_at?: string;
};

export type ReviewBypassSession = PhoneVerificationSession & {
  review_bypass: true;
  user: UserProfile;
};

export type PhoneVerifyResult =
  | {
      phone_verified: true;
      session_id: string;
      phone: string;
    }
  | {
      phone_verified: true;
      next_step: "login" | "reset_password";
      session_id: string;
      phone: string;
      message?: string;
    };

export type RegisterPhoneAccountInput = {
  session_id: unknown;
  phone: unknown;
  first_name: unknown;
  last_name: unknown;
  birth_date: unknown;
  login: unknown;
  password: unknown;
  avatar_url?: unknown;
};

export type RegisterProfileAccountInput = {
  first_name: unknown;
  last_name: unknown;
  birth_date: unknown;
  login: unknown;
  password: unknown;
  interests?: unknown;
  interest_ids?: unknown;
  interestIds?: unknown;
  selectedInterests?: unknown;
  avatar_url?: unknown;
};

export class PhoneAuthError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fallbackSessions = new Map<string, SessionRow>();

export function jsonResponse(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizePurpose(value: unknown): PhoneAuthPurpose {
  return asString(value).trim().toLowerCase() === "recovery" ? "recovery" : "signup";
}

export function normalizePhoneNumber(value: unknown): string | null {
  const raw = asString(value).trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("+")) {
    const digits = normalizeDigits(raw);
    if (digits.length < 10 || digits.length > 15) {
      return null;
    }

    return `+${digits}`;
  }

  const digits = normalizeDigits(raw);
  if (digits.length === 9) {
    return `+998${digits}`;
  }

  if (digits.startsWith("998") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export function normalizeVerificationCode(value: unknown): string | null {
  const digits = normalizeDigits(asString(value));
  return digits.length === CODE_LENGTH ? digits : null;
}

function normalizeLogin(value: unknown): string | null {
  const login = asString(value).trim().toLowerCase();
  if (!login || !/^[a-z0-9_]{3,32}$/.test(login)) {
    return null;
  }

  return login;
}

function normalizeName(value: unknown): string | null {
  const name = asString(value).trim();
  return name ? name.slice(0, 80) : null;
}

function normalizeBirthDate(value: unknown): string | null {
  const birthDate = asString(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return null;
  }

  const parsed = new Date(`${birthDate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : birthDate;
}

function normalizePassword(value: unknown): string | null {
  const password = asString(value);
  return password.length >= PASSWORD_MIN_LENGTH ? password : null;
}

function normalizeAvatarUrl(value: unknown): string | null {
  const avatarUrl = asString(value).trim();
  return avatarUrl || null;
}

function normalizeInterestSelections(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of value) {
    const normalized = asString(entry).trim();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique].slice(0, 12);
}

function collectRegisterInterestSelections(input: RegisterProfileAccountInput): string[] {
  const unique = new Set<string>();

  for (const value of [input.interests, input.interest_ids, input.interestIds, input.selectedInterests]) {
    for (const entry of normalizeInterestSelections(value)) {
      unique.add(entry);
    }
  }

  return [...unique].slice(0, 12);
}

function normalizeInterestLookupValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUserInterestValue(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function isMissingUserInterestColumn(error: SchemaErrorLike | null | undefined, column: string): boolean {
  const errorText = formatSchemaError(error).toLowerCase();
  return errorText.includes(column.toLowerCase()) && /schema cache|could not find|does not exist/.test(errorText);
}

function parseDataUrl(value: string): { mimeType: string; base64: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1].trim().toLowerCase(),
    base64: match[2].trim(),
  };
}

function getImageExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
    case "image/heif":
      return "heic";
    default:
      return "jpg";
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) {
    return false;
  }

  // bcrypt hash (pgcrypto crypt or bcryptjs)
  if (storedHash.startsWith("$2")) {
    console.log("[phoneAuth] verifyPassword: bcrypt hash detected");
    return compareSync(password, storedHash);
  }

  // scrypt$salt$hash format
  if (storedHash.startsWith("scrypt$")) {
    console.log("[phoneAuth] verifyPassword: scrypt hash detected");
    const parts = storedHash.split("$");
    if (parts.length !== 3) {
      return false;
    }

    const actualHash = scryptSync(password, parts[1], 64);
    const expectedHash = Buffer.from(parts[2], "hex");
    if (actualHash.length !== expectedHash.length) {
      return false;
    }

    return timingSafeEqual(actualHash, expectedHash);
  }

  console.warn("[phoneAuth] verifyPassword: unknown hash format:", storedHash.slice(0, 10));
  return false;
}

function sanitizeProfile(profile: PrivateProfileRow, subscriptionInfo?: SubscriptionInfo): UserProfile {
  const firstName = profile.first_name?.trim() ?? "";
  const lastName = profile.last_name?.trim() ?? "";
  const fullName = profile.full_name?.trim() || [firstName, lastName].filter(Boolean).join(" ") || null;
  const resolvedSubscriptionInfo = subscriptionInfo ?? buildSubscriptionInfo(undefined, profile.subscription);

  return {
    id: profile.id,
    phone: profile.phone ?? null,
    phone_verified: Boolean(profile.phone_verified),
    telegram_verified: null,
    telegram_verified_at: null,
    telegram_gateway_verified_at: null,
    telegram_id: null,
    telegram_username: null,
    full_name: fullName,
    first_name: profile.first_name ?? null,
    last_name: profile.last_name ?? null,
    birth_date: profile.birth_date ?? null,
    login: profile.login ?? null,
    name: fullName,
    email: null,
    avatar_url: profile.avatar_url ?? null,
    provider: profile.provider ?? null,
    subscription: resolvedSubscriptionInfo.plan,
    subscription_info: resolvedSubscriptionInfo,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

async function serializeProfile(admin: SupabaseClient, profile: PrivateProfileRow): Promise<UserProfile> {
  const subscriptionInfo = await readSubscriptionInfo(admin, profile.id, profile.subscription);
  return sanitizeProfile(profile, subscriptionInfo);
}

function getAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new PhoneAuthError(503, "Server konfiguratsiyasi to'liq emas");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function getAuthClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new PhoneAuthError(503, "Server konfiguratsiyasi to'liq emas");
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function phoneSessionsTable(admin: SupabaseClient) {
  return admin.schema("public").from(PHONE_SESSIONS_TABLE);
}

function isMissingSessionsTableError(message: string): boolean {
  if (/row.level security|policy|permission denied|violates/i.test(message)) {
    return false;
  }

  return /column .* does not exist|relation .* does not exist|schema cache|does not exist/i.test(message);
}

function formatSchemaError(error: SchemaErrorLike | null | undefined): string {
  return [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" | ");
}

function isMissingProfileColumnError(errorText: string, column: string): boolean {
  const normalizedError = errorText.toLowerCase();
  const normalizedColumn = column.toLowerCase();

  if (!/does not exist|schema cache|could not find|not found/i.test(normalizedError)) {
    return false;
  }

  return (
    normalizedError.includes(`'${normalizedColumn}'`) ||
    normalizedError.includes(`\"${normalizedColumn}\"`) ||
    normalizedError.includes(`.${normalizedColumn}`) ||
    normalizedError.includes(` ${normalizedColumn} `)
  );
}

async function ensureProfileAuthColumns(admin: SupabaseClient, contextError?: SchemaErrorLike): Promise<void> {
  const checks = await Promise.all(
    REQUIRED_PROFILE_AUTH_COLUMNS.map(async (column) => {
      const result = await admin.from("profiles").select(column).limit(1);
      const errorText = formatSchemaError(result.error);
      return {
        column,
        missing: Boolean(result.error) && isMissingProfileColumnError(errorText, column),
        errorText,
      };
    })
  );

  const missingColumns = checks.filter((item) => item.missing).map((item) => item.column);
  if (missingColumns.length === 0) {
    return;
  }

  console.error("[phone-auth] Missing profile auth columns", {
    requiredColumns: REQUIRED_PROFILE_AUTH_COLUMNS,
    missingColumns,
    contextError: formatSchemaError(contextError),
    probeErrors: checks.filter((item) => item.missing).map((item) => item.errorText),
  });

  throw new PhoneAuthError(500, `profiles jadvali auth ustunlari yetishmayapti: ${missingColumns.join(", ")}`, missingColumns.join(","));
}

function isRoleColumnMissing(errorText: string): boolean {
  return /role/i.test(errorText) && /does not exist|schema cache|could not find|not found/i.test(errorText);
}

function mapOtpSendError(error: unknown): PhoneAuthError {
  const message = error instanceof Error ? error.message : "SMS kod yuborilmadi";
  const normalized = message.toLowerCase();

  if (/rate|limit|too many/i.test(normalized)) {
    return new PhoneAuthError(429, "SMS yuborish limiti tugadi. Keyinroq qayta urinib ko'ring");
  }

  if (/phone|invalid/i.test(normalized)) {
    return new PhoneAuthError(400, "Telefon raqamini +998 formatida kiriting");
  }

  return new PhoneAuthError(500, message || "SMS kod yuborilmadi");
}

function mapOtpVerifyError(error: unknown): PhoneAuthError {
  const message = error instanceof Error ? error.message : "Tasdiqlash kodi tekshirilmadi";
  const normalized = message.toLowerCase();

  if (/expired/i.test(normalized)) {
    return new PhoneAuthError(410, "Tasdiqlash kodi muddati tugagan. Yangi kod so'rang");
  }

  if (/invalid|token|otp/i.test(normalized)) {
    return new PhoneAuthError(401, "Tasdiqlash kodi noto'g'ri");
  }

  if (/rate|limit|too many/i.test(normalized)) {
    return new PhoneAuthError(429, "Maksimal urinishlar soni tugadi. Yangi kod so'rang");
  }

  return new PhoneAuthError(500, message || "Tasdiqlash kodi tekshirilmadi");
}

async function getProfileByPhone(admin: SupabaseClient, phone: string, includePassword = false): Promise<PrivateProfileRow | null> {
  const result = await admin
    .from("profiles")
    .select(includePassword ? PRIVATE_PROFILE_COLUMNS : PUBLIC_PROFILE_COLUMNS)
    .eq("phone", phone)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);
    throw new PhoneAuthError(500, "Profilni o'qib bo'lmadi");
  }

  return (result.data as PrivateProfileRow | null) ?? null;
}

async function getProfileByLogin(admin: SupabaseClient, login: string): Promise<PrivateProfileRow | null> {
  const result = await admin
    .from("profiles")
    .select(PRIVATE_PROFILE_COLUMNS)
    .eq("login", login)
    .maybeSingle();

  if (result.error) {
    console.warn("[phoneAuth] getProfileByLogin full columns failed, retrying with minimal columns:", {
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      code: result.error.code,
    });

    // Fall back to minimal columns in case some extended columns are missing in DB
    const fallback = await admin
      .from("profiles")
      .select("id, login, password_hash, phone, phone_verified, full_name, first_name, last_name, avatar_url, provider, created_at, updated_at")
      .eq("login", login)
      .maybeSingle();

    if (fallback.error) {
      console.error("[phoneAuth] getProfileByLogin fallback also failed:", {
        message: fallback.error.message,
        details: fallback.error.details,
        hint: fallback.error.hint,
        code: fallback.error.code,
      });
      throw new PhoneAuthError(500, "Profilni o'qib bo'lmadi");
    }

    return (fallback.data as PrivateProfileRow | null) ?? null;
  }

  return (result.data as PrivateProfileRow | null) ?? null;
}

async function getProfileIdByPhone(admin: SupabaseClient, phone: string): Promise<string | null> {
  const result = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);
    throw new PhoneAuthError(500, "Telefonni tekshirib bo'lmadi");
  }

  return typeof result.data?.id === "string" ? result.data.id : null;
}

async function getProfileIdByLogin(admin: SupabaseClient, login: string): Promise<string | null> {
  const result = await admin.from("profiles").select("id").eq("login", login).maybeSingle();
  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);
    throw new PhoneAuthError(500, "Loginni tekshirib bo'lmadi");
  }

  return typeof result.data?.id === "string" ? result.data.id : null;
}

async function createVerificationSession(admin: SupabaseClient, phone: string, purpose: PhoneAuthPurpose, profileId?: string | null): Promise<PhoneVerificationSession> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000).toISOString();
  const requestId = randomUUID();
  const fallbackId = randomUUID();
  const fallbackSession: SessionRow = {
    id: fallbackId,
    phone,
    request_id: requestId,
    purpose,
    status: "pending",
    expires_at: expiresAt,
    verified_at: null,
    created_at: now.toISOString(),
    profile_id: profileId ?? null,
  };

  const result = await phoneSessionsTable(admin)
    .insert({
      phone,
      request_id: requestId,
      purpose,
      status: "pending",
      expires_at: expiresAt,
      created_at: now.toISOString(),
    })
    .select("id, phone, request_id, purpose, status, expires_at, verified_at, created_at")
    .single();

  if (result.error || !result.data) {
    if (isMissingSessionsTableError(result.error?.message || "")) {
      fallbackSessions.set(fallbackId, fallbackSession);
      return {
        session_id: fallbackSession.id,
        phone: fallbackSession.phone,
        purpose: fallbackSession.purpose,
        ttl: TTL_SECONDS,
        expires_at: fallbackSession.expires_at,
      };
    }

    throw new PhoneAuthError(500, "Telefon sessiyasini saqlab bo'lmadi", "db_insert_failed");
  }

  if (profileId) {
    fallbackSessions.set(result.data.id, { ...(result.data as Omit<SessionRow, "profile_id">), profile_id: profileId });
  }

  return {
    session_id: result.data.id,
    phone: result.data.phone,
    purpose: result.data.purpose as PhoneAuthPurpose,
    ttl: TTL_SECONDS,
    expires_at: result.data.expires_at,
  };
}

async function getVerificationSession(admin: SupabaseClient, sessionId: string): Promise<SessionRow | null> {
  if (!isUuid(sessionId)) {
    return fallbackSessions.get(sessionId) ?? null;
  }

  const result = await phoneSessionsTable(admin)
    .select("id, phone, request_id, purpose, status, expires_at, verified_at, created_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (result.error) {
    if (isMissingSessionsTableError(result.error.message || "")) {
      return fallbackSessions.get(sessionId) ?? null;
    }

    throw new PhoneAuthError(500, "Telefon sessiyasini o'qib bo'lmadi");
  }

  if (!result.data) {
    return null;
  }

  return {
    ...(result.data as Omit<SessionRow, "profile_id">),
    profile_id: fallbackSessions.get(result.data.id)?.profile_id ?? null,
  };
}

const SESSION_UPDATE_ALLOWED = new Set(["status", "verified_at", "expires_at", "purpose"]);

async function updateVerificationSession(admin: SupabaseClient, sessionId: string, patch: Partial<SessionRow>): Promise<void> {
  const persistedPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (SESSION_UPDATE_ALLOWED.has(key)) {
      persistedPatch[key] = value;
    }
  }

  const { profile_id } = patch;

  if (Object.keys(persistedPatch).length > 0) {
    const result = await phoneSessionsTable(admin).update(persistedPatch).eq("id", sessionId);
    if (result.error && !isMissingSessionsTableError(result.error.message || "")) {
      console.error("[phoneAuth] updateVerificationSession failed:", {
        sessionId,
        patch: persistedPatch,
        message: result.error.message,
        details: result.error.details,
        hint: result.error.hint,
        code: result.error.code,
      });
      throw new PhoneAuthError(
        500,
        `Telefon sessiyasini yangilab bo'lmadi: ${result.error.message ?? ""} | ${result.error.details ?? ""}`,
        "db_update_failed"
      );
    }
  }

  const existing = fallbackSessions.get(sessionId);
  if (existing || profile_id !== undefined) {
    fallbackSessions.set(sessionId, {
      ...(existing ?? ({ id: sessionId } as SessionRow)),
      ...existing,
      ...patch,
      id: sessionId,
    });
  }
}

async function updateProfile(admin: SupabaseClient, profileId: string, patch: Record<string, unknown>): Promise<UserProfile> {
  const result = await admin
    .from("profiles")
    .update(patch)
    .eq("id", profileId)
    .select(PUBLIC_PROFILE_COLUMNS)
    .single();

  if (result.error || !result.data) {
    await ensureProfileAuthColumns(admin, result.error);
    throw new PhoneAuthError(500, "Profilni yangilab bo'lmadi");
  }

  return serializeProfile(admin, result.data as PrivateProfileRow);
}

async function insertProfile(admin: SupabaseClient, payload: Record<string, unknown>) {
  let result = await admin
    .from("profiles")
    .insert({
      ...payload,
      role: "user",
    })
    .select(PUBLIC_PROFILE_COLUMNS)
    .single();

  if (result.error && isRoleColumnMissing(formatSchemaError(result.error))) {
    result = await admin.from("profiles").insert(payload).select(PUBLIC_PROFILE_COLUMNS).single();
  }

  return result;
}

async function ensureAvatarBucket(admin: SupabaseClient): Promise<void> {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) {
    throw new PhoneAuthError(500, "Profil rasmini saqlash uchun storage ochilmadi", "storage_unavailable");
  }

  const bucketExists = (buckets ?? []).some((bucket) => {
    const bucketName = typeof bucket.name === "string" ? bucket.name : "";
    const bucketId = typeof bucket.id === "string" ? bucket.id : "";
    return bucketId === PROFILE_AVATARS_BUCKET || bucketName === PROFILE_AVATARS_BUCKET;
  });

  if (bucketExists) {
    return;
  }

  const createResult = await admin.storage.createBucket(PROFILE_AVATARS_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  });

  if (createResult.error && !/already exists/i.test(createResult.error.message ?? "")) {
    throw new PhoneAuthError(500, "Profil rasmini saqlash uchun bucket yaratilmadi", "storage_bucket_failed");
  }
}

async function persistAvatar(admin: SupabaseClient, profileId: string, avatarInput: unknown): Promise<string | null> {
  const avatarUrl = normalizeAvatarUrl(avatarInput);
  if (!avatarUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(avatarUrl)) {
    return avatarUrl;
  }

  const parsedDataUrl = parseDataUrl(avatarUrl);
  if (!parsedDataUrl) {
    return avatarUrl;
  }

  await ensureAvatarBucket(admin);

  const filePath = `${profileId}/${Date.now()}.${getImageExtension(parsedDataUrl.mimeType)}`;
  const uploadResult = await admin.storage.from(PROFILE_AVATARS_BUCKET).upload(
    filePath,
    Buffer.from(parsedDataUrl.base64, "base64"),
    {
      contentType: parsedDataUrl.mimeType,
      upsert: true,
    }
  );

  if (uploadResult.error) {
    throw new PhoneAuthError(500, "Profil rasmini saqlab bo'lmadi", "avatar_upload_failed");
  }

  const publicUrlResult = admin.storage.from(PROFILE_AVATARS_BUCKET).getPublicUrl(filePath);
  return publicUrlResult.data.publicUrl;
}

async function ensureInterestCategoryIds(admin: SupabaseClient, interestIds: string[]): Promise<string[]> {
  if (interestIds.length < MIN_INTEREST_COUNT) {
    throw new PhoneAuthError(400, "Kamida 3 ta qiziqish tanlang", "interests_min");
  }

  const result = await admin
    .from("categories")
    .select("id, slug, name_uz, name_uz_cy, name_ru, name_en");

  if (result.error) {
    throw new PhoneAuthError(500, "Qiziqishlarni tekshirib bo'lmadi", "interests_lookup_failed");
  }

  const categories = Array.isArray(result.data) ? result.data : [];
  const categoryIdsByLookup = new Map<string, string>();

  for (const row of categories) {
    const id = asString(row?.id).trim();
    if (!id) {
      continue;
    }

    for (const value of [row.id, row.slug, row.name_uz, row.name_uz_cy, row.name_ru, row.name_en]) {
      const rawValue = value === null || value === undefined ? "" : asString(value).trim();
      if (!rawValue) {
        continue;
      }

      categoryIdsByLookup.set(normalizeInterestLookupValue(rawValue), id);
    }
  }

  const validIds = new Set<string>();
  for (const interestId of interestIds) {
    const resolvedId = categoryIdsByLookup.get(normalizeInterestLookupValue(interestId));
    if (resolvedId) {
      validIds.add(resolvedId);
    }
  }

  if (validIds.size < MIN_INTEREST_COUNT) {
    throw new PhoneAuthError(400, "Kamida 3 ta qiziqish tanlang", "interests_min");
  }

  return [...validIds].slice(0, 12);
}

async function replaceUserInterests(admin: SupabaseClient, profileId: string, interestIds: string[]): Promise<void> {
  const deleteResult = await admin.from("user_interests").delete().eq("user_id", profileId);
  if (deleteResult.error) {
    throw new PhoneAuthError(500, "Qiziqishlarni saqlab bo'lmadi", "interests_delete_failed");
  }

  const insertRows = (column: "interest_id" | "category_id" | "category") =>
    interestIds.map((interestId) => ({
      user_id: profileId,
      [column]: normalizeUserInterestValue(interestId),
      score: 10,
    }));

  let insertResult = await admin.from("user_interests").insert(insertRows("interest_id"));

  if (insertResult.error && isMissingUserInterestColumn(insertResult.error, "interest_id")) {
    insertResult = await admin.from("user_interests").insert(insertRows("category_id"));
  }

  if (insertResult.error && isMissingUserInterestColumn(insertResult.error, "category_id")) {
    insertResult = await admin.from("user_interests").insert(insertRows("category"));
  }

  if (insertResult.error) {
    console.error("[phoneAuth] replaceUserInterests failed", {
      profileId,
      interestIds,
      error: insertResult.error,
    });
    throw new PhoneAuthError(500, "Qiziqishlarni saqlab bo'lmadi", "interests_upsert_failed");
  }
}

async function sendOtp(phone: string): Promise<void> {
  const authClient = getAuthClient();
  const { error } = await authClient.auth.signInWithOtp({ phone });
  if (error) {
    throw mapOtpSendError(error);
  }
}

async function verifyOtp(phone: string, code: string): Promise<void> {
  const authClient = getAuthClient();
  const { error } = await authClient.auth.verifyOtp({
    phone,
    token: code,
    type: "sms",
  });

  if (error) {
    throw mapOtpVerifyError(error);
  }
}

async function resolveRecoveryProfile(admin: SupabaseClient, identifier: unknown): Promise<PrivateProfileRow> {
  const rawIdentifier = asString(identifier).trim();
  if (!rawIdentifier) {
    throw new PhoneAuthError(400, "Login yoki telefonni kiriting");
  }

  const phone = normalizePhoneNumber(rawIdentifier);
  if (phone) {
    const profile = await getProfileByPhone(admin, phone, true);
    if (!profile) {
      throw new PhoneAuthError(404, "Bu login yoki telefon bo'yicha profil topilmadi");
    }
    return profile;
  }

  const login = normalizeLogin(rawIdentifier);
  if (!login) {
    throw new PhoneAuthError(400, "Login yoki telefonni to'g'ri kiriting");
  }

  const profile = await getProfileByLogin(admin, login);
  if (!profile) {
    throw new PhoneAuthError(404, "Bu login yoki telefon bo'yicha profil topilmadi");
  }

  if (!profile.phone) {
    throw new PhoneAuthError(404, "Bu profilga telefon raqami biriktirilmagan");
  }

  return profile;
}

async function ensureReviewTestProfile(admin: SupabaseClient): Promise<UserProfile> {
  const existingProfile = await getProfileByPhone(admin, REVIEW_TEST_PHONE, false);
  if (existingProfile) {
    return serializeProfile(admin, existingProfile);
  }

  const now = new Date().toISOString();
  const result = await insertProfile(admin, {
    id: randomUUID(),
    phone: REVIEW_TEST_PHONE,
    phone_verified: true,
    first_name: "App",
    last_name: "Review",
    full_name: REVIEW_TEST_NAME,
    name: REVIEW_TEST_NAME,
    birth_date: "2000-01-01",
    login: REVIEW_TEST_LOGIN,
    password_hash: hashPassword(randomUUID()),
    avatar_url: null,
    provider: "review",
    subscription: "free",
    updated_at: now,
  });

  if (result.error || !result.data) {
    const errorText = formatSchemaError(result.error);
    if (/duplicate key value/i.test(errorText) && /phone|login/i.test(errorText)) {
      const profile = await getProfileByPhone(admin, REVIEW_TEST_PHONE, false);
      if (profile) {
        return serializeProfile(admin, profile);
      }
    }

    await ensureProfileAuthColumns(admin, result.error);
    throw new PhoneAuthError(500, "Review profilini yaratib bo'lmadi", "review_profile_failed");
  }

  const subscriptionInfo = await upsertSubscriptionInfo(
    admin,
    {
      userId: result.data.id,
      plan: (result.data as PrivateProfileRow).subscription ?? "free",
      status: "active",
      starts_at: now,
    },
    { strict: false }
  );

  return sanitizeProfile(result.data as PrivateProfileRow, subscriptionInfo);
}

async function createReviewBypassSession(admin: SupabaseClient): Promise<ReviewBypassSession> {
  const user = await ensureReviewTestProfile(admin);
  const session = await createVerificationSession(admin, REVIEW_TEST_PHONE, "signup", user.id);

  await updateVerificationSession(admin, session.session_id, {
    status: "completed",
    verified_at: new Date().toISOString(),
    profile_id: user.id,
  });

  return {
    ...session,
    review_bypass: true,
    user,
  };
}

export async function sendPhoneVerificationCode(input: SendCodeInput): Promise<PhoneVerificationSession | ReviewBypassSession> {
  const purpose = normalizePurpose(input.purpose);
  const admin = getAdminClient();

  if (purpose === "recovery") {
    const profile = await resolveRecoveryProfile(admin, input.identifier);
    await sendOtp(profile.phone as string);
    return createVerificationSession(admin, profile.phone as string, "recovery", profile.id);
  }

  const phone = normalizePhoneNumber(input.phone);
  if (!phone) {
    throw new PhoneAuthError(400, "Telefon raqamini +998 formatida kiriting");
  }

  if (phone === REVIEW_TEST_PHONE) {
    return createReviewBypassSession(admin);
  }

  await sendOtp(phone);
  return createVerificationSession(admin, phone, "signup");
}

export async function verifyPhoneCode(sessionIdInput: unknown, codeInput: unknown): Promise<PhoneVerifyResult> {
  const sessionId = asString(sessionIdInput).trim();
  if (!sessionId) {
    throw new PhoneAuthError(400, "session_id_missing", "session_id_missing");
  }

  const code = normalizeVerificationCode(codeInput);
  if (!code) {
    throw new PhoneAuthError(400, "Tasdiqlash kodi 6 ta raqam bo'lishi kerak");
  }

  const admin = getAdminClient();
  const session = await getVerificationSession(admin, sessionId);
  if (!session) {
    throw new PhoneAuthError(404, "Tasdiqlash sessiyasi topilmadi", "session_not_found");
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await updateVerificationSession(admin, session.id, { status: "expired" });
    throw new PhoneAuthError(410, "Tasdiqlash kodi muddati tugagan. Yangi kod so'rang");
  }

  await verifyOtp(session.phone, code);
  const verifiedAt = new Date().toISOString();

  if (session.purpose === "recovery") {
    await updateVerificationSession(admin, session.id, {
      status: "verified",
      verified_at: verifiedAt,
    });

    return {
      phone_verified: true,
      next_step: "reset_password",
      session_id: session.id,
      phone: session.phone,
    };
  }

  let existingProfile: PrivateProfileRow | null = null;
  try {
    existingProfile = await getProfileByPhone(admin, session.phone, false);
  } catch {
    // Treat DB errors as "no profile found" — user will proceed to registration
    existingProfile = null;
  }
  if (existingProfile) {
    await updateVerificationSession(admin, session.id, {
      status: "existing_account",
      verified_at: verifiedAt,
      profile_id: existingProfile.id,
    });

    return {
      phone_verified: true,
      next_step: "login",
      session_id: session.id,
      phone: session.phone,
      message: EXISTING_PHONE_MESSAGE,
    };
  }

  await updateVerificationSession(admin, session.id, {
    status: "verified",
    verified_at: verifiedAt,
  });

  return {
    phone_verified: true,
    session_id: session.id,
    phone: session.phone,
  };
}

export async function registerPhoneAccount(input: RegisterPhoneAccountInput): Promise<UserProfile> {
  const sessionId = asString(input.session_id).trim();
  if (!sessionId) {
    throw new PhoneAuthError(400, "session_id kiritilmadi");
  }

  const phone = normalizePhoneNumber(input.phone);
  const firstName = normalizeName(input.first_name);
  const lastName = normalizeName(input.last_name);
  const birthDate = normalizeBirthDate(input.birth_date);
  const login = normalizeLogin(input.login);
  const password = normalizePassword(input.password);
  const avatarUrl = normalizeAvatarUrl(input.avatar_url);

  if (!phone || !firstName || !lastName || !birthDate || !login || !password) {
    throw new PhoneAuthError(400, "Ro'yxatdan o'tish uchun barcha maydonlarni to'g'ri kiriting");
  }

  const admin = getAdminClient();
  const session = await getVerificationSession(admin, sessionId);
  if (!session) {
    throw new PhoneAuthError(404, "Tasdiqlash sessiyasi topilmadi", "session_not_found");
  }

  if (session.purpose !== "signup") {
    throw new PhoneAuthError(400, "Bu sessiya ro'yxatdan o'tish uchun emas");
  }

  if (session.phone !== phone) {
    throw new PhoneAuthError(400, "Tasdiqlangan telefon raqami mos emas");
  }

  if (session.status === "existing_account") {
    throw new PhoneAuthError(409, EXISTING_PHONE_MESSAGE, "phone_exists");
  }

  if (session.status !== "verified") {
    throw new PhoneAuthError(400, "Avval telefon raqamingizni tasdiqlang");
  }

  const phoneOwnerId = await getProfileIdByPhone(admin, phone);
  if (phoneOwnerId) {
    throw new PhoneAuthError(409, EXISTING_PHONE_MESSAGE, "phone_exists");
  }

  const loginOwnerId = await getProfileIdByLogin(admin, login);
  if (loginOwnerId) {
    throw new PhoneAuthError(409, "Bu login allaqachon band", "login_taken");
  }

  const now = new Date().toISOString();
  const fullName = `${firstName} ${lastName}`.trim();
  const result = await insertProfile(admin, {
    id: randomUUID(),
    phone,
    phone_verified: true,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    name: fullName,
    birth_date: birthDate,
    login,
    password_hash: hashPassword(password),
    avatar_url: avatarUrl,
    provider: "phone",
    updated_at: now,
  });

  if (result.error || !result.data) {
    const errorText = formatSchemaError(result.error);
    if (/duplicate key value/i.test(errorText) && /phone/i.test(errorText)) {
      throw new PhoneAuthError(409, EXISTING_PHONE_MESSAGE, "phone_exists");
    }

    if (/duplicate key value/i.test(errorText) && /login/i.test(errorText)) {
      throw new PhoneAuthError(409, "Bu login allaqachon band", "login_taken");
    }

    await ensureProfileAuthColumns(admin, result.error);
    throw new PhoneAuthError(500, "Profil yaratib bo'lmadi", "db_insert_failed");
  }

  await updateVerificationSession(admin, session.id, {
    status: "completed",
    profile_id: result.data.id,
  });

  const subscriptionInfo = await upsertSubscriptionInfo(
    admin,
    {
      userId: result.data.id,
      plan: (result.data as PrivateProfileRow).subscription ?? "free",
      status: "active",
      starts_at: now,
    },
    { strict: false }
  );

  return sanitizeProfile(result.data as PrivateProfileRow, subscriptionInfo);
}

export async function registerProfileAccount(input: RegisterProfileAccountInput): Promise<UserProfile> {
  const firstName = normalizeName(input.first_name);
  const lastName = normalizeName(input.last_name);
  const birthDate = normalizeBirthDate(input.birth_date);
  const login = normalizeLogin(input.login);
  const password = normalizePassword(input.password);
  const interestIds = collectRegisterInterestSelections(input);

  if (!firstName || !lastName || !birthDate || !login || !password) {
    throw new PhoneAuthError(400, "Ro'yxatdan o'tish uchun barcha maydonlarni to'g'ri kiriting");
  }

  const admin = getAdminClient();
  const validInterestIds = await ensureInterestCategoryIds(admin, interestIds);

  const existingLoginId = await getProfileIdByLogin(admin, login);
  if (existingLoginId) {
    throw new PhoneAuthError(409, LOGIN_TAKEN_MESSAGE, "login_taken");
  }

  const profileId = randomUUID();
  const avatarUrl = await persistAvatar(admin, profileId, input.avatar_url);
  const now = new Date().toISOString();
  const fullName = `${firstName} ${lastName}`.trim();
  const result = await insertProfile(admin, {
    id: profileId,
    phone: null,
    phone_verified: false,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    name: fullName,
    birth_date: birthDate,
    login,
    password_hash: hashPassword(password),
    avatar_url: avatarUrl,
    provider: "credentials",
    subscription: "free",
    updated_at: now,
  });

  if (result.error || !result.data) {
    const errorText = formatSchemaError(result.error);
    if (/duplicate key value/i.test(errorText) && /login/i.test(errorText)) {
      throw new PhoneAuthError(409, LOGIN_TAKEN_MESSAGE, "login_taken");
    }

    await ensureProfileAuthColumns(admin, result.error);
    throw new PhoneAuthError(500, "Profil yaratib bo'lmadi", "db_insert_failed");
  }

  try {
    await replaceUserInterests(admin, profileId, validInterestIds);
  } catch (error) {
    await admin.from("profiles").delete().eq("id", profileId);
    throw error;
  }

  const subscriptionInfo = await upsertSubscriptionInfo(
    admin,
    {
      userId: profileId,
      plan: (result.data as PrivateProfileRow).subscription ?? "free",
      status: "active",
      starts_at: now,
    },
    { strict: false }
  );

  return sanitizeProfile(result.data as PrivateProfileRow, subscriptionInfo);
}

export async function loginWithPassword(loginInput: unknown, passwordInput: unknown): Promise<UserProfile> {
  const login = normalizeLogin(loginInput);
  const password = normalizePassword(passwordInput);
  if (!login || !password) {
    throw new PhoneAuthError(400, "Login va parolni to'g'ri kiriting");
  }

  const admin = getAdminClient();
  const profile = await getProfileByLogin(admin, login);
  if (!profile) {
    throw new PhoneAuthError(401, "Login yoki parol noto'g'ri", "login_not_found");
  }

  if (!verifyPassword(password, profile.password_hash)) {
    throw new PhoneAuthError(401, "Login yoki parol noto'g'ri", "wrong_password");
  }

  return serializeProfile(admin, profile);
}

export async function resetPasswordWithVerifiedPhone(sessionIdInput: unknown, passwordInput: unknown): Promise<UserProfile> {
  const sessionId = asString(sessionIdInput).trim();
  if (!sessionId) {
    throw new PhoneAuthError(400, "session_id kiritilmadi");
  }

  const password = normalizePassword(passwordInput);
  if (!password) {
    throw new PhoneAuthError(400, `Parol kamida ${PASSWORD_MIN_LENGTH} ta belgidan iborat bo'lishi kerak`);
  }

  const admin = getAdminClient();
  const session = await getVerificationSession(admin, sessionId);
  if (!session) {
    throw new PhoneAuthError(404, "Tasdiqlash sessiyasi topilmadi", "session_not_found");
  }

  if (session.purpose !== "recovery") {
    throw new PhoneAuthError(400, "Bu sessiya parolni tiklash uchun emas");
  }

  if (session.status !== "verified") {
    throw new PhoneAuthError(400, "Avval SMS kodini tasdiqlang");
  }

  const profile = await getProfileByPhone(admin, session.phone, true);
  if (!profile) {
    throw new PhoneAuthError(404, "Bu telefon raqamiga biriktirilgan profil topilmadi");
  }

  const now = new Date().toISOString();
  const user = await updateProfile(admin, profile.id, {
    password_hash: hashPassword(password),
    phone_verified: true,
    updated_at: now,
  });

  await updateVerificationSession(admin, session.id, {
    status: "completed",
    profile_id: profile.id,
  });

  return user;
}

/**
 * Dev-only: set a scrypt password for a user by login.
 * Call only from protected dev endpoints, never expose to the public.
 */
export async function setPasswordForLogin(loginInput: string, passwordInput: string): Promise<UserProfile> {
  const login = normalizeLogin(loginInput);
  if (!login) {
    throw new PhoneAuthError(400, "Login noto'g'ri");
  }

  if (!passwordInput || passwordInput.length < PASSWORD_MIN_LENGTH) {
    throw new PhoneAuthError(400, `Parol kamida ${PASSWORD_MIN_LENGTH} ta belgidan iborat bo'lishi kerak`);
  }

  const admin = getAdminClient();
  const profile = await getProfileByLogin(admin, login);
  if (!profile) {
    throw new PhoneAuthError(404, "Login topilmadi", "login_not_found");
  }

  return updateProfile(admin, profile.id, {
    password_hash: hashPassword(passwordInput),
    updated_at: new Date().toISOString(),
  });
}