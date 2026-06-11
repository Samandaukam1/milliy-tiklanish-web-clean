import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildSubscriptionInfo } from "@/lib/server/subscriptions";
import type { UserProfile } from "@/lib/types";

const TELEGRAM_GATEWAY_TOKEN = process.env.TELEGRAM_GATEWAY_TOKEN ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CODE_LENGTH = 6;
const TTL_SECONDS = 300;
const PASSWORD_MIN_LENGTH = 6;
const PHONE_SESSIONS_TABLE = "phone_verification_sessions";
const fallbackSessions = new Map<string, SessionRow>();
const REGISTER_PHONE_EXISTS_MESSAGE = "Bu raqamdan avval foydalanilgan. Agar parolni tiklamoqchi bo‘lsangiz, Parolni tiklash bo‘limiga o‘ting.";
const PUBLIC_PROFILE_COLUMNS = "id, full_name, role, phone, phone_verified, first_name, last_name, birth_date, login, avatar_url, provider, subscription, created_at, updated_at";
const PRIVATE_PROFILE_COLUMNS = `${PUBLIC_PROFILE_COLUMNS}, password_hash`;
const REQUIRED_PROFILE_AUTH_COLUMNS = [
  "phone",
  "phone_verified",
  "telegram_gateway_verified_at",
  "first_name",
  "last_name",
  "birth_date",
  "login",
  "password_hash",
  "avatar_url",
] as const;

type JsonBody = Record<string, unknown>;

type VerificationPurpose = "signup" | "register" | "recovery" | "change_phone";

type GatewayResponse<T> = {
  ok?: boolean;
  result?: T;
  error?: string;
};

type GatewayVerificationStatus = {
  status?: string;
  updated_at?: number;
  code_entered?: string;
};

type GatewayRequestStatus = {
  request_id?: string;
  phone_number?: string;
  verification_status?: GatewayVerificationStatus;
};

type SessionRow = {
  id: string;
  phone: string;
  request_id: string;
  purpose: VerificationPurpose;
  status: string;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
  profile_id?: string | null;
};

type PrivateProfileRow = UserProfile & {
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  login?: string | null;
  telegram_gateway_verified_at?: string | null;
  password_hash?: string | null;
};

type SchemaErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

export type SendCodeOptions = {
  purpose?: VerificationPurpose;
  user_id?: unknown;
  current_password?: unknown;
};

export type SendCodeResult =
  | {
      success: true;
      session_id: string;
      phone: string;
      purpose: VerificationPurpose;
      ttl: number;
      expires_at?: string;
    }
  | {
      success: false;
      reason: "phone_exists";
      message: string;
      phone: string;
      purpose: "signup";
    };

export type VerifyCodeResult =
  | {
      phone_verified: true;
      session_id: string;
      phone: string;
    }
  | {
      phone_verified: true;
      next_step: "reset_password";
      session_id: string;
      phone: string;
    }
  | {
      phone_verified: true;
      next_step: "phone_changed";
      session_id: string;
      phone: string;
      user: UserProfile;
    };

export type RegisterAccountInput = {
  session_id: unknown;
  phone: unknown;
  first_name: unknown;
  last_name: unknown;
  birth_date: unknown;
  login: unknown;
  password: unknown;
  avatar_url?: unknown;
};

export class TelegramGatewayError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizePurpose(value: unknown): VerificationPurpose {
  const purpose = asString(value).trim().toLowerCase();
  if (purpose === "recovery") {
    return "recovery";
  }

  if (purpose === "change_phone") {
    return "change_phone";
  }

  return "signup";
}

function isSignupPurpose(purpose: VerificationPurpose): boolean {
  return purpose === "signup" || purpose === "register";
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
  if (!login) {
    return null;
  }

  if (!/^[a-z0-9_]{3,32}$/.test(login)) {
    return null;
  }

  return login;
}

function normalizeName(value: unknown): string | null {
  const name = asString(value).trim();
  if (!name) {
    return null;
  }

  return name.slice(0, 80);
}

function normalizeBirthDate(value: unknown): string | null {
  const birthDate = asString(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return null;
  }

  const parsed = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return birthDate;
}

function normalizePassword(value: unknown): string | null {
  const password = asString(value);
  if (password.length < PASSWORD_MIN_LENGTH) {
    return null;
  }

  return password;
}

function normalizeAvatarUrl(value: unknown): string | null {
  const avatarUrl = asString(value).trim();
  if (!avatarUrl) {
    return null;
  }

  return avatarUrl;
}

function createDeterministicUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
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

  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, expectedHash] = parts;
  const actualHash = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (actualHash.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expectedBuffer);
}

function sanitizeProfile(profile: PrivateProfileRow): UserProfile {
  const firstName = profile.first_name?.trim() ?? "";
  const lastName = profile.last_name?.trim() ?? "";
  const fullName = profile.full_name?.trim() || [firstName, lastName].filter(Boolean).join(" ") || null;
  const subscriptionInfo = buildSubscriptionInfo(undefined, profile.subscription);

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
    name: fullName,
    first_name: profile.first_name ?? null,
    last_name: profile.last_name ?? null,
    birth_date: profile.birth_date ?? null,
    login: profile.login ?? null,
    email: null,
    avatar_url: profile.avatar_url ?? null,
    provider: profile.provider ?? null,
    subscription: subscriptionInfo.plan,
    subscription_info: subscriptionInfo,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

function getAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new TelegramGatewayError(503, "Server konfiguratsiyasi to'liq emas");
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function assertGatewayToken() {
  if (!TELEGRAM_GATEWAY_TOKEN) {
    throw new TelegramGatewayError(500, "TELEGRAM_GATEWAY_TOKEN missing");
  }
}

function isMissingSessionsTableError(message: string): boolean {
  // Must NOT match RLS/policy violations — those contain the table name but the table exists.
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

  console.error("[telegram-auth] Missing profile auth columns", {
    requiredColumns: REQUIRED_PROFILE_AUTH_COLUMNS,
    missingColumns,
    contextError: formatSchemaError(contextError),
    probeErrors: checks.filter((item) => item.missing).map((item) => item.errorText),
  });

  throw new TelegramGatewayError(
    500,
    `profiles jadvali auth ustunlari yetishmayapti: ${missingColumns.join(", ")}`,
    missingColumns.join(",")
  );
}

function phoneSessionsTable(admin: SupabaseClient) {
  return admin.schema("public").from(PHONE_SESSIONS_TABLE);
}

function mapGatewayError(code: string | undefined): TelegramGatewayError {
  switch (code) {
    case "BALANCE_NOT_ENOUGH":
      return new TelegramGatewayError(402, "Telegram Gateway balansida mablag' yetarli emas", code);
    case "PHONE_NUMBER_INVALID":
      return new TelegramGatewayError(400, "Telefon raqami noto'g'ri", code);
    case "PHONE_NUMBER_FLOOD":
      return new TelegramGatewayError(429, "Bu raqam uchun juda ko'p urinish bo'ldi. Keyinroq qayta urinib ko'ring", code);
    case "ACCESS_TOKEN_INVALID":
      return new TelegramGatewayError(500, "TELEGRAM_GATEWAY_TOKEN noto'g'ri", code);
    case "ACCESS_TOKEN_EXPIRED":
      return new TelegramGatewayError(500, "TELEGRAM_GATEWAY_TOKEN muddati tugagan", code);
    default:
      return new TelegramGatewayError(502, "Telegram Gateway so'rovini bajarib bo'lmadi", code);
  }
}

async function parseGatewayResponse<T>(response: Response): Promise<GatewayResponse<T>> {
  const text = await response.text();

  try {
    return JSON.parse(text) as GatewayResponse<T>;
  } catch {
    throw new TelegramGatewayError(502, `Telegram Gateway JSON qaytarmadi: ${text.slice(0, 120)}`);
  }
}

async function callGateway(method: string, body: JsonBody): Promise<GatewayRequestStatus> {
  assertGatewayToken();

  const response = await fetch(`https://gatewayapi.telegram.org/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TELEGRAM_GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await parseGatewayResponse<GatewayRequestStatus>(response);
  if (!response.ok || !payload.ok || !payload.result) {
    throw mapGatewayError(payload.error);
  }

  return payload.result;
}

async function getProfileByPhone(admin: SupabaseClient, phone: string, includePassword = false): Promise<PrivateProfileRow | null> {
  const result = await admin
    .from("profiles")
    .select(includePassword ? PRIVATE_PROFILE_COLUMNS : PUBLIC_PROFILE_COLUMNS)
    .eq("phone", phone)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);

    throw new TelegramGatewayError(500, "Profilni o'qib bo'lmadi");
  }

  return (result.data as PrivateProfileRow | null) ?? null;
}

async function getProfileIdByPhone(admin: SupabaseClient, phone: string): Promise<string | null> {
  const result = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);
    throw new TelegramGatewayError(500, "Telefon raqamini tekshirib bo'lmadi");
  }

  return typeof result.data?.id === "string" ? result.data.id : null;
}

async function getProfileByLogin(admin: SupabaseClient, login: string): Promise<PrivateProfileRow | null> {
  const result = await admin
    .from("profiles")
    .select(PRIVATE_PROFILE_COLUMNS)
    .eq("login", login)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);

    throw new TelegramGatewayError(500, "Profilni o'qib bo'lmadi");
  }

  return (result.data as PrivateProfileRow | null) ?? null;
}

async function getProfileIdByLogin(admin: SupabaseClient, login: string): Promise<string | null> {
  const result = await admin
    .from("profiles")
    .select("id")
    .eq("login", login)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);
    throw new TelegramGatewayError(500, "Loginni tekshirib bo'lmadi");
  }

  return typeof result.data?.id === "string" ? result.data.id : null;
}

async function getProfileById(admin: SupabaseClient, id: string, includePassword = false): Promise<PrivateProfileRow | null> {
  const result = await admin
    .from("profiles")
    .select(includePassword ? PRIVATE_PROFILE_COLUMNS : PUBLIC_PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);

    throw new TelegramGatewayError(500, "Profilni o'qib bo'lmadi");
  }

  return (result.data as PrivateProfileRow | null) ?? null;
}

async function createVerificationSession(
  admin: SupabaseClient,
  phone: string,
  requestId: string,
  purpose: VerificationPurpose,
  profileId: string | null
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000).toISOString();
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
    profile_id: profileId,
  };

  const result = await phoneSessionsTable(admin)
    .insert({
      phone,
      request_id: requestId,
      purpose: isSignupPurpose(purpose) ? "signup" : purpose,
      status: "pending",
      expires_at: expiresAt,
      created_at: now.toISOString(),
    })
    .select("id, phone, request_id, purpose, status, expires_at, verified_at, created_at")
    .single();

  if (result.error || !result.data) {
    const message = result.error?.message || "";
    console.error("DB INSERT ERROR:", {
      message: result.error?.message,
      details: result.error?.details,
      hint: result.error?.hint,
      code: result.error?.code,
    });
    if (isMissingSessionsTableError(message)) {
      console.warn("[telegram-auth] phone_verification_sessions table missing — using in-memory fallback");
      fallbackSessions.set(fallbackId, fallbackSession);
      return {
        session_id: fallbackSession.id,
        phone: fallbackSession.phone,
        purpose: fallbackSession.purpose,
        expires_at: fallbackSession.expires_at,
      };
    }

    throw new TelegramGatewayError(
      500,
      `Telefon sessiyasini saqlab bo'lmadi: ${result.error?.message ?? "null data"}`,
      "db_insert_failed"
    );
  }

  const data = result.data as Omit<SessionRow, "profile_id">;
  console.log("SESSION SAVED:", { id: data.id, phone: data.phone, request_id: data.request_id, purpose: data.purpose });
  if (profileId) {
    fallbackSessions.set(data.id, { ...data, profile_id: profileId });
  }

  return {
    session_id: data.id,
    phone: data.phone,
    purpose: data.purpose,
    expires_at: data.expires_at,
  };
}

async function getLatestPendingVerificationSession(admin: SupabaseClient, phone: string): Promise<SessionRow | null> {
  const result = await phoneSessionsTable(admin)
    .select("id, phone, request_id, purpose, status, expires_at, verified_at, created_at")
    .eq("phone", phone)
    .eq("purpose", "signup")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    const message = result.error.message || "";
    if (isMissingSessionsTableError(message)) {
      const fallbackMatches = [...fallbackSessions.values()]
        .filter((session) => session.phone === phone && isSignupPurpose(session.purpose) && session.status === "pending")
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      return fallbackMatches[0] ?? null;
    }

    throw new TelegramGatewayError(500, "Telefon sessiyasini o'qib bo'lmadi");
  }

  const data = result.data as Omit<SessionRow, "profile_id"> | null;
  if (!data) {
    return null;
  }

  return {
    ...data,
    profile_id: fallbackSessions.get(data.id)?.profile_id ?? null,
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
    const message = result.error.message || "";
    if (isMissingSessionsTableError(message)) {
      return fallbackSessions.get(sessionId) ?? null;
    }

    throw new TelegramGatewayError(500, "Telefon sessiyasini o'qib bo'lmadi");
  }

  const data = result.data as Omit<SessionRow, "profile_id"> | null;
  if (!data) {
    return null;
  }

  return {
    ...data,
    profile_id: fallbackSessions.get(data.id)?.profile_id ?? null,
  };
}

// Only columns that exist in phone_verification_sessions:
// id, phone, request_id, purpose, status, expires_at, verified_at, created_at
// profile_id, attempts and any other fields are NOT in the DB schema and must be excluded.
const SESSION_UPDATE_ALLOWED = new Set(["status", "verified_at", "expires_at", "purpose"]);

async function updateVerificationSession(admin: SupabaseClient, sessionId: string, patch: Partial<SessionRow>) {
  // Strip any columns that do not exist in the DB table.
  const persistedPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (SESSION_UPDATE_ALLOWED.has(key)) {
      persistedPatch[key] = value;
    }
  }

  // Keep in-memory fallback in sync regardless of DB outcome.
  const { profile_id } = patch;

  if (Object.keys(persistedPatch).length > 0) {
    console.log("[session-update]", sessionId, persistedPatch);
    const result = await phoneSessionsTable(admin)
      .update(persistedPatch)
      .eq("id", sessionId);

    if (result.error) {
      console.error("SESSION UPDATE ERROR:", {
        sessionId,
        patch: persistedPatch,
        message: result.error.message,
        details: result.error.details,
        hint: result.error.hint,
        code: result.error.code,
      });

      if (isMissingSessionsTableError(result.error.message || "")) {
        // Table missing — fall through to in-memory only.
      } else {
        throw new TelegramGatewayError(
          500,
          `Telefon sessiyasini yangilab bo'lmadi: ${result.error.message ?? ""} | ${result.error.details ?? ""} | hint: ${result.error.hint ?? ""} | code: ${result.error.code ?? ""}`,
          "db_update_failed"
        );
      }
    }
  }

  const existing = fallbackSessions.get(sessionId);
  if (existing || profile_id !== undefined) {
    fallbackSessions.set(sessionId, {
      ...(existing ?? { id: sessionId } as SessionRow),
      ...existing,
      ...patch,
      id: sessionId,
    });
  }
}

async function createOrUpdateProfile(admin: SupabaseClient, profileId: string, patch: Record<string, unknown>): Promise<UserProfile> {
  const result = await admin
    .from("profiles")
    .update(patch)
    .eq("id", profileId)
    .select(PUBLIC_PROFILE_COLUMNS)
    .single();

  if (result.error || !result.data) {
    await ensureProfileAuthColumns(admin, result.error);

    throw new TelegramGatewayError(500, "Profilni yangilab bo'lmadi");
  }

  return sanitizeProfile(result.data as unknown as PrivateProfileRow);
}

function getVerificationFailure(status: string) {
  switch (status) {
    case "code_invalid":
      return new TelegramGatewayError(401, "Tasdiqlash kodi noto'g'ri", status);
    case "code_max_attempts_exceeded":
      return new TelegramGatewayError(429, "Maksimal urinishlar soni tugadi. Yangi kod so'rang", status);
    case "expired":
      return new TelegramGatewayError(410, "Tasdiqlash kodi muddati tugagan. Yangi kod so'rang", status);
    default:
      return new TelegramGatewayError(502, "Telegram Gateway tasdiqlash holatini qaytarmadi", status);
  }
}

export async function sendTelegramGatewayCode(phoneInput: unknown, options: SendCodeOptions = {}): Promise<SendCodeResult> {
  const phone = normalizePhoneNumber(phoneInput);
  if (!phone) {
    throw new TelegramGatewayError(400, "Telefon raqamini +998 formatida kiriting");
  }

  const purpose = normalizePurpose(options.purpose);
  const admin = getAdminClient();
  let profileId: string | null = null;

  if (isSignupPurpose(purpose)) {
    const existingProfileId = await getProfileIdByPhone(admin, phone);
    if (existingProfileId) {
      return {
        success: false,
        reason: "phone_exists",
        message: REGISTER_PHONE_EXISTS_MESSAGE,
        phone,
        purpose: "signup",
      };
    }
  }

  if (purpose === "recovery") {
    const existingProfile = await getProfileByPhone(admin, phone, true);
    if (!existingProfile) {
      throw new TelegramGatewayError(404, "Bu raqamga biriktirilgan profil topilmadi");
    }
    profileId = existingProfile.id;
  }

  if (purpose === "change_phone") {
    const currentPassword = normalizePassword(options.current_password);
    const userId = asString(options.user_id).trim();
    if (!userId || !currentPassword) {
      throw new TelegramGatewayError(400, "Telefonni almashtirish uchun joriy parolni kiriting");
    }

    const currentProfile = await getProfileById(admin, userId, true);
    if (!currentProfile) {
      throw new TelegramGatewayError(404, "Profil topilmadi");
    }

    if (!verifyPassword(currentPassword, currentProfile.password_hash)) {
      throw new TelegramGatewayError(401, "Joriy parol noto'g'ri");
    }

    if (currentProfile.phone === phone) {
      throw new TelegramGatewayError(400, "Yangi telefon raqami hozirgi raqam bilan bir xil");
    }

    const phoneOwner = await getProfileByPhone(admin, phone, false);
    if (phoneOwner && phoneOwner.id !== currentProfile.id) {
      throw new TelegramGatewayError(409, "Bu telefon boshqa profilga biriktirilgan");
    }

    profileId = currentProfile.id;
  }

  const gatewayResult = await callGateway("sendVerificationMessage", {
    phone_number: phone,
    code_length: CODE_LENGTH,
    ttl: TTL_SECONDS,
  });
  const requestId = gatewayResult.request_id?.trim();
  if (!requestId) {
    throw new TelegramGatewayError(502, "Telegram Gateway request_id qaytarmadi");
  }

  const session = await createVerificationSession(admin, phone, requestId, purpose, profileId);
  return {
    success: true,
    session_id: session.session_id,
    phone: session.phone,
    purpose: isSignupPurpose(purpose) ? "signup" : purpose,
    ttl: TTL_SECONDS,
    expires_at: session.expires_at,
  };
}

export async function verifyTelegramGatewayCode(sessionIdInput: unknown, codeInput: unknown, phoneInput?: unknown): Promise<VerifyCodeResult> {
  const sessionId = asString(sessionIdInput).trim();
  const phone = normalizePhoneNumber(phoneInput);
  console.log("verify session_id:", sessionId || null);

  if (!sessionId && !phone) {
    throw new TelegramGatewayError(400, "session_id_missing", "session_id_missing");
  }

  const code = normalizeVerificationCode(codeInput);
  if (!code) {
    throw new TelegramGatewayError(400, "Tasdiqlash kodi 6 ta raqam bo'lishi kerak");
  }

  const admin = getAdminClient();
  let session = sessionId ? await getVerificationSession(admin, sessionId) : null;
  if (!session && phone) {
    session = await getLatestPendingVerificationSession(admin, phone);
  }

  if (!session) {
    throw new TelegramGatewayError(404, "session_not_found", "session_not_found");
  }

  const resolvedSessionId = session.id;

  if (!session.request_id) {
    throw new TelegramGatewayError(500, "request_id_missing", "request_id_missing");
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await updateVerificationSession(admin, resolvedSessionId, { status: "expired" });
    throw new TelegramGatewayError(410, "Tasdiqlash kodi muddati tugagan. Yangi kod so'rang");
  }

  const gatewayResult = await callGateway("checkVerificationStatus", {
    request_id: session.request_id,
    code,
  });
  const verificationStatus = gatewayResult.verification_status?.status?.trim();
  if (!verificationStatus) {
    throw new TelegramGatewayError(502, "Telegram Gateway tasdiqlash holatini qaytarmadi");
  }

  if (verificationStatus !== "code_valid") {
    await updateVerificationSession(admin, resolvedSessionId, { status: verificationStatus });
    throw getVerificationFailure(verificationStatus);
  }

  const verifiedAt = new Date().toISOString();

  if (isSignupPurpose(session.purpose)) {
    await updateVerificationSession(admin, resolvedSessionId, {
      status: "verified",
      verified_at: verifiedAt,
    });

    return {
      phone_verified: true,
      session_id: resolvedSessionId,
      phone: session.phone,
    };
  }

  if (session.purpose === "recovery") {
    const profile = session.profile_id
      ? await getProfileById(admin, session.profile_id, true)
      : await getProfileByPhone(admin, session.phone, true);
    if (!profile) {
      throw new TelegramGatewayError(404, "Bu raqamga biriktirilgan profil topilmadi");
    }

    await updateVerificationSession(admin, resolvedSessionId, {
      status: "verified",
      verified_at: verifiedAt,
      profile_id: profile.id,
    });

    return {
      phone_verified: true,
      next_step: "reset_password",
      session_id: resolvedSessionId,
      phone: session.phone,
    };
  }

  const profile = session.profile_id
    ? await getProfileById(admin, session.profile_id, true)
    : null;
  if (!profile) {
    throw new TelegramGatewayError(404, "Profil topilmadi");
  }

  const phoneOwner = await getProfileByPhone(admin, session.phone, false);
  if (phoneOwner && phoneOwner.id !== profile.id) {
    throw new TelegramGatewayError(409, "Bu telefon boshqa profilga biriktirilgan");
  }

  await updateVerificationSession(admin, resolvedSessionId, {
    status: "completed",
    verified_at: verifiedAt,
  });

  const user = await createOrUpdateProfile(admin, profile.id, {
    phone: session.phone,
    phone_verified: true,
    telegram_gateway_verified_at: verifiedAt,
    updated_at: verifiedAt,
  });

  return {
    phone_verified: true,
    next_step: "phone_changed",
    session_id: resolvedSessionId,
    phone: session.phone,
    user,
  };
}

export async function registerWithVerifiedPhone(input: RegisterAccountInput): Promise<UserProfile> {
  const sessionId = asString(input.session_id).trim();
  if (!sessionId) {
    throw new TelegramGatewayError(400, "session_id kiritilmadi");
  }

  const phone = normalizePhoneNumber(input.phone);
  const firstName = normalizeName(input.first_name);
  const lastName = normalizeName(input.last_name);
  const birthDate = normalizeBirthDate(input.birth_date);
  const login = normalizeLogin(input.login);
  const password = normalizePassword(input.password);
  const avatarUrl = normalizeAvatarUrl(input.avatar_url);
  if (!phone || !firstName || !lastName || !birthDate || !login || !password) {
    throw new TelegramGatewayError(400, "Ro'yxatdan o'tish uchun barcha maydonlarni to'g'ri kiriting");
  }

  const admin = getAdminClient();
  const session = await getVerificationSession(admin, sessionId);
  if (!session) {
    throw new TelegramGatewayError(404, "Tasdiqlash sessiyasi topilmadi");
  }

  if (!isSignupPurpose(session.purpose)) {
    throw new TelegramGatewayError(400, "Bu sessiya ro'yxatdan o'tish uchun emas");
  }

  if (phone !== session.phone) {
    throw new TelegramGatewayError(400, "Tasdiqlangan telefon raqami mos emas");
  }

  if (session.status !== "verified") {
    throw new TelegramGatewayError(400, "Avval telefon raqamingizni tasdiqlang");
  }

  const phoneOwnerId = await getProfileIdByPhone(admin, session.phone);
  if (phoneOwnerId) {
    throw new TelegramGatewayError(409, REGISTER_PHONE_EXISTS_MESSAGE, "phone_exists");
  }

  const loginOwnerId = await getProfileIdByLogin(admin, login);
  if (loginOwnerId) {
    throw new TelegramGatewayError(409, "Bu login allaqachon band");
  }

  const now = new Date().toISOString();
  const fullName = `${firstName} ${lastName}`.trim();
  const profileId = randomUUID();
  const insertPayload = {
    id: profileId,
    role: "user",
    phone: session.phone,
    phone_verified: true,
    telegram_gateway_verified_at: session.verified_at ?? now,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    birth_date: birthDate,
    login,
    password_hash: hashPassword(password),
    avatar_url: avatarUrl,
    updated_at: now,
  };
  console.log("[register] inserting profile:", { id: profileId, phone: session.phone, login, full_name: fullName });

  const inserted = await admin
    .from("profiles")
    .insert(insertPayload)
    .select(PUBLIC_PROFILE_COLUMNS)
    .single();

  if (inserted.error || !inserted.data) {
    console.error("PROFILE INSERT ERROR:", {
      message: inserted.error?.message,
      details: inserted.error?.details,
      hint: inserted.error?.hint,
      code: inserted.error?.code,
    });

    const errMsg = inserted.error?.message || "";
    const isDuplicate = /duplicate key value/i.test(errMsg);

    if (isDuplicate && /login/i.test(errMsg)) {
      throw new TelegramGatewayError(409, "Bu login allaqachon band", "login_taken");
    }

    if (isDuplicate && /phone/i.test(errMsg)) {
      throw new TelegramGatewayError(409, REGISTER_PHONE_EXISTS_MESSAGE, "phone_taken");
    }

    await ensureProfileAuthColumns(admin, inserted.error);

    throw new TelegramGatewayError(
      500,
      `Profil yaratib bo'lmadi: ${inserted.error?.message ?? "null data"} | ${inserted.error?.details ?? ""} | hint: ${inserted.error?.hint ?? ""} | code: ${inserted.error?.code ?? ""}`,
      "db_insert_failed"
    );
  }

  await updateVerificationSession(admin, session.id, {
    status: "completed",
    profile_id: (inserted.data as unknown as PrivateProfileRow).id,
  });

  return sanitizeProfile(inserted.data as unknown as PrivateProfileRow);
}

export async function loginWithPassword(loginInput: unknown, passwordInput: unknown): Promise<UserProfile> {
  const login = normalizeLogin(loginInput);
  const password = normalizePassword(passwordInput);
  if (!login || !password) {
    throw new TelegramGatewayError(400, "Login va parolni to'g'ri kiriting");
  }

  const admin = getAdminClient();
  const profile = await getProfileByLogin(admin, login);
  if (!profile || !verifyPassword(password, profile.password_hash)) {
    throw new TelegramGatewayError(401, "Login yoki parol noto'g'ri");
  }

  return sanitizeProfile(profile);
}

export async function resetPasswordWithVerifiedPhone(sessionIdInput: unknown, passwordInput: unknown): Promise<UserProfile> {
  const sessionId = asString(sessionIdInput).trim();
  if (!sessionId) {
    throw new TelegramGatewayError(400, "session_id kiritilmadi");
  }

  const password = normalizePassword(passwordInput);
  if (!password) {
    throw new TelegramGatewayError(400, `Parol kamida ${PASSWORD_MIN_LENGTH} ta belgidan iborat bo'lishi kerak`);
  }

  const admin = getAdminClient();
  const session = await getVerificationSession(admin, sessionId);
  if (!session) {
    throw new TelegramGatewayError(404, "session_not_found", "session_not_found");
  }

  if (session.purpose !== "recovery") {
    throw new TelegramGatewayError(400, "Bu sessiya parolni tiklash uchun emas");
  }

  if (session.status !== "verified") {
    throw new TelegramGatewayError(400, "Avval Telegram kodini tasdiqlang");
  }

  const profile = session.profile_id
    ? await getProfileById(admin, session.profile_id, true)
    : await getProfileByPhone(admin, session.phone, true);
  if (!profile) {
    throw new TelegramGatewayError(404, "Bu raqamga biriktirilgan profil topilmadi");
  }

  const now = new Date().toISOString();
  const user = await createOrUpdateProfile(admin, profile.id, {
    password_hash: hashPassword(password),
    phone_verified: true,
    telegram_gateway_verified_at: session.verified_at ?? now,
    updated_at: now,
  });

  await updateVerificationSession(admin, session.id, {
    status: "completed",
    profile_id: profile.id,
  });

  return user;
}
