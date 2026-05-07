import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.PORT || 3000);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SCRIPT_DIR);
const CODE_LENGTH = 6;
const TTL_SECONDS = 300;
const PASSWORD_MIN_LENGTH = 6;
const PHONE_SESSIONS_TABLE = "phone_verification_sessions";
const fallbackSessions = new Map();
const REGISTER_PHONE_EXISTS_MESSAGE = "Bu raqamdan avval foydalanilgan. Agar parolni tiklamoqchi bo‘lsangiz, Parolni tiklash bo‘limiga o‘ting.";
const PUBLIC_PROFILE_COLUMNS = "id, phone, phone_verified, telegram_verified_at, telegram_id, telegram_username, full_name, first_name, last_name, birth_date, login, avatar_url, created_at, updated_at, telegram_gateway_verified_at, telegram_verified";
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
];

loadEnvFile();

const TELEGRAM_GATEWAY_TOKEN = process.env.TELEGRAM_GATEWAY_TOKEN ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function loadEnvFile() {
  const envPath = join(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function asString(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeDigits(value) {
  return value.replace(/\D/g, "");
}

function normalizePurpose(value) {
  const purpose = asString(value).trim().toLowerCase();
  if (purpose === "recovery") {
    return "recovery";
  }

  if (purpose === "change_phone") {
    return "change_phone";
  }

  return "signup";
}

function isSignupPurpose(purpose) {
  return purpose === "signup" || purpose === "register";
}

function normalizePhoneNumber(value) {
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

function normalizeVerificationCode(value) {
  const digits = normalizeDigits(asString(value));
  return digits.length === CODE_LENGTH ? digits : null;
}

function normalizeLogin(value) {
  const login = asString(value).trim().toLowerCase();
  if (!login || !/^[a-z0-9_]{3,32}$/.test(login)) {
    return null;
  }

  return login;
}

function normalizeName(value) {
  const name = asString(value).trim();
  return name ? name.slice(0, 80) : null;
}

function normalizeBirthDate(value) {
  const birthDate = asString(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return null;
  }

  const parsed = new Date(`${birthDate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : birthDate;
}

function normalizePassword(value) {
  const password = asString(value);
  return password.length >= PASSWORD_MIN_LENGTH ? password : null;
}

function normalizeAvatarUrl(value) {
  const avatarUrl = asString(value).trim();
  return avatarUrl || null;
}

function createDeterministicUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const actualHash = scryptSync(password, parts[1], 64);
  const expectedHash = Buffer.from(parts[2], "hex");
  if (actualHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expectedHash);
}

function sanitizeProfile(profile) {
  return {
    id: profile.id,
    phone: profile.phone ?? null,
    phone_verified: Boolean(profile.phone_verified),
    telegram_verified: profile.telegram_verified ?? null,
    telegram_verified_at: profile.telegram_verified_at ?? null,
    telegram_gateway_verified_at: profile.telegram_gateway_verified_at ?? null,
    telegram_id: profile.telegram_id ?? null,
    telegram_username: profile.telegram_username ?? null,
    full_name: profile.full_name ?? null,
    first_name: profile.first_name ?? null,
    last_name: profile.last_name ?? null,
    birth_date: profile.birth_date ?? null,
    login: profile.login ?? null,
    name: profile.name ?? null,
    email: profile.email ?? null,
    avatar_url: profile.avatar_url ?? null,
    provider: profile.provider ?? null,
    subscription: profile.subscription ?? "free",
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw { status: 503, message: "Server konfiguratsiyasi to'liq emas" };
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function isMissingSessionsTableError(message) {
  if (/row.level security|policy|permission denied|violates/i.test(message || "")) {
    return false;
  }
  return /column .* does not exist|relation .* does not exist|schema cache|does not exist/i.test(message || "");
}

function formatSchemaError(error) {
  return [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" | ");
}

function isMissingProfileColumnError(errorText, column) {
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

async function ensureProfileAuthColumns(admin, contextError) {
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

  console.error("[telegram-auth-server] Missing profile auth columns", {
    requiredColumns: REQUIRED_PROFILE_AUTH_COLUMNS,
    missingColumns,
    contextError: formatSchemaError(contextError),
    probeErrors: checks.filter((item) => item.missing).map((item) => item.errorText),
  });

  throw {
    status: 500,
    message: `profiles jadvali auth ustunlari yetishmayapti: ${missingColumns.join(", ")}`,
    code: missingColumns.join(","),
  };
}

function mapGatewayError(code) {
  switch (code) {
    case "BALANCE_NOT_ENOUGH":
      return { status: 402, message: "Telegram Gateway balansida mablag' yetarli emas", code };
    case "PHONE_NUMBER_INVALID":
      return { status: 400, message: "Telefon raqami noto'g'ri", code };
    case "PHONE_NUMBER_FLOOD":
      return { status: 429, message: "Bu raqam uchun juda ko'p urinish bo'ldi. Keyinroq qayta urinib ko'ring", code };
    case "ACCESS_TOKEN_INVALID":
      return { status: 500, message: "TELEGRAM_GATEWAY_TOKEN noto'g'ri", code };
    case "ACCESS_TOKEN_EXPIRED":
      return { status: 500, message: "TELEGRAM_GATEWAY_TOKEN muddati tugagan", code };
    default:
      return { status: 502, message: "Telegram Gateway so'rovini bajarib bo'lmadi", code };
  }
}

async function parseGatewayResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw { status: 502, message: `Telegram Gateway JSON qaytarmadi: ${text.slice(0, 120)}` };
  }
}

async function callGateway(method, body) {
  if (!TELEGRAM_GATEWAY_TOKEN) {
    throw { status: 500, message: "TELEGRAM_GATEWAY_TOKEN missing" };
  }

  const response = await fetch(`https://gatewayapi.telegram.org/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TELEGRAM_GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await parseGatewayResponse(response);
  if (!response.ok || !payload?.ok || !payload?.result) {
    throw mapGatewayError(payload?.error);
  }

  return payload.result;
}

async function getProfileByPhone(admin, phone, includePassword = false) {
  const result = await admin
    .from("profiles")
    .select(includePassword ? PRIVATE_PROFILE_COLUMNS : PUBLIC_PROFILE_COLUMNS)
    .eq("phone", phone)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);

    throw { status: 500, message: "Profilni o'qib bo'lmadi" };
  }

  return result.data ?? null;
}

async function getProfileIdByPhone(admin, phone) {
  const result = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);
    throw { status: 500, message: "Telefon raqamini tekshirib bo'lmadi" };
  }

  return typeof result.data?.id === "string" ? result.data.id : null;
}

async function getProfileByLogin(admin, login) {
  const result = await admin
    .from("profiles")
    .select(PRIVATE_PROFILE_COLUMNS)
    .eq("login", login)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);

    throw { status: 500, message: "Profilni o'qib bo'lmadi" };
  }

  return result.data ?? null;
}

async function getProfileIdByLogin(admin, login) {
  const result = await admin
    .from("profiles")
    .select("id")
    .eq("login", login)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);
    throw { status: 500, message: "Loginni tekshirib bo'lmadi" };
  }

  return typeof result.data?.id === "string" ? result.data.id : null;
}

async function getProfileById(admin, id, includePassword = false) {
  const result = await admin
    .from("profiles")
    .select(includePassword ? PRIVATE_PROFILE_COLUMNS : PUBLIC_PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (result.error) {
    await ensureProfileAuthColumns(admin, result.error);

    throw { status: 500, message: "Profilni o'qib bo'lmadi" };
  }

  return result.data ?? null;
}

async function createVerificationSession(admin, phone, requestId, purpose, profileId) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000).toISOString();
  const fallbackId = randomUUID();
  const fallbackSession = {
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

  const result = await admin
    .schema("public")
    .from(PHONE_SESSIONS_TABLE)
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
    console.error("DB INSERT ERROR:", {
      message: result.error?.message,
      details: result.error?.details,
      hint: result.error?.hint,
      code: result.error?.code,
    });
    if (isMissingSessionsTableError(result.error?.message || "")) {
      console.warn("[telegram-auth-server] phone_verification_sessions table missing — using in-memory fallback");
      fallbackSessions.set(fallbackId, fallbackSession);
      return {
        session_id: fallbackSession.id,
        phone: fallbackSession.phone,
        purpose: fallbackSession.purpose,
        expires_at: fallbackSession.expires_at,
      };
    }

    throw { status: 500, message: `Telefon sessiyasini saqlab bo'lmadi: ${result.error?.message ?? "null data"}`, code: "db_insert_failed" };
  }

  const data = result.data;
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

async function getLatestPendingVerificationSession(admin, phone) {
  const result = await admin
    .schema("public")
    .from(PHONE_SESSIONS_TABLE)
    .select("id, phone, request_id, purpose, status, expires_at, verified_at, created_at")
    .eq("phone", phone)
    .eq("purpose", "signup")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    if (isMissingSessionsTableError(result.error.message || "")) {
      const fallbackMatches = [...fallbackSessions.values()]
        .filter((session) => session.phone === phone && session.status === "pending" && isSignupPurpose(session.purpose))
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      return fallbackMatches[0] ?? null;
    }

    throw { status: 500, message: "Telefon sessiyasini o'qib bo'lmadi" };
  }

  if (!result.data) {
    return null;
  }

  return {
    ...result.data,
    profile_id: fallbackSessions.get(result.data.id)?.profile_id ?? null,
  };
}

async function getVerificationSession(admin, sessionId) {
  if (!isUuid(sessionId)) {
    return fallbackSessions.get(sessionId) ?? null;
  }

  const result = await admin
    .schema("public")
    .from(PHONE_SESSIONS_TABLE)
    .select("id, phone, request_id, purpose, status, expires_at, verified_at, created_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (result.error) {
    if (isMissingSessionsTableError(result.error.message || "")) {
      return fallbackSessions.get(sessionId) ?? null;
    }

    throw { status: 500, message: "Telefon sessiyasini o'qib bo'lmadi" };
  }

  if (!result.data) {
    return null;
  }

  return {
    ...result.data,
    profile_id: fallbackSessions.get(result.data.id)?.profile_id ?? null,
  };
}

const SESSION_UPDATE_ALLOWED = new Set(["status", "verified_at", "expires_at", "purpose"]);

async function updateVerificationSession(admin, sessionId, patch) {
  const persistedPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (SESSION_UPDATE_ALLOWED.has(key)) {
      persistedPatch[key] = value;
    }
  }

  const { profile_id } = patch;

  if (Object.keys(persistedPatch).length > 0) {
    console.log("[session-update]", sessionId, persistedPatch);
    const result = await admin
      .schema("public")
      .from(PHONE_SESSIONS_TABLE)
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
        // fall through to in-memory only
      } else {
        throw { status: 500, message: `Telefon sessiyasini yangilab bo'lmadi: ${result.error.message ?? ""} | ${result.error.details ?? ""} | hint: ${result.error.hint ?? ""} | code: ${result.error.code ?? ""}`, code: "db_update_failed" };
      }
    }
  }

  const existing = fallbackSessions.get(sessionId);
  if (existing || profile_id !== undefined) {
    fallbackSessions.set(sessionId, {
      ...(existing ?? { id: sessionId }),
      ...existing,
      ...patch,
      id: sessionId,
    });
  }
}

async function updateProfile(admin, profileId, patch) {
  const result = await admin
    .from("profiles")
    .update(patch)
    .eq("id", profileId)
    .select(PUBLIC_PROFILE_COLUMNS)
    .single();

  if (result.error || !result.data) {
    await ensureProfileAuthColumns(admin, result.error);

    throw { status: 500, message: "Profilni yangilab bo'lmadi" };
  }

  return sanitizeProfile(result.data);
}

function getVerificationFailure(status) {
  switch (status) {
    case "code_invalid":
      return { status: 401, message: "Tasdiqlash kodi noto'g'ri", code: status };
    case "code_max_attempts_exceeded":
      return { status: 429, message: "Maksimal urinishlar soni tugadi. Yangi kod so'rang", code: status };
    case "expired":
      return { status: 410, message: "Tasdiqlash kodi muddati tugagan. Yangi kod so'rang", code: status };
    default:
      return { status: 502, message: "Telegram Gateway tasdiqlash holatini qaytarmadi", code: status };
  }
}

async function sendTelegramGatewayCode(phoneInput, options = {}) {
  const phone = normalizePhoneNumber(phoneInput);
  if (!phone) {
    throw { status: 400, message: "Telefon raqamini +998 formatida kiriting" };
  }

  const purpose = normalizePurpose(options.purpose);
  const admin = getAdminClient();
  let profileId = null;

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
    const profile = await getProfileByPhone(admin, phone, true);
    if (!profile) {
      throw { status: 404, message: "Bu raqamga biriktirilgan profil topilmadi" };
    }
    profileId = profile.id;
  }

  if (purpose === "change_phone") {
    const currentPassword = normalizePassword(options.current_password);
    const userId = asString(options.user_id).trim();
    if (!userId || !currentPassword) {
      throw { status: 400, message: "Telefonni almashtirish uchun joriy parolni kiriting" };
    }

    const currentProfile = await getProfileById(admin, userId, true);
    if (!currentProfile) {
      throw { status: 404, message: "Profil topilmadi" };
    }

    if (!verifyPassword(currentPassword, currentProfile.password_hash)) {
      throw { status: 401, message: "Joriy parol noto'g'ri" };
    }

    if (currentProfile.phone === phone) {
      throw { status: 400, message: "Yangi telefon raqami hozirgi raqam bilan bir xil" };
    }

    const phoneOwner = await getProfileByPhone(admin, phone, false);
    if (phoneOwner && phoneOwner.id !== currentProfile.id) {
      throw { status: 409, message: "Bu telefon boshqa profilga biriktirilgan" };
    }

    profileId = currentProfile.id;
  }

  const gatewayResult = await callGateway("sendVerificationMessage", {
    phone_number: phone,
    code_length: CODE_LENGTH,
    ttl: TTL_SECONDS,
  });
  const requestId = typeof gatewayResult.request_id === "string" ? gatewayResult.request_id.trim() : "";
  if (!requestId) {
    throw { status: 502, message: "Telegram Gateway request_id qaytarmadi" };
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

async function verifyTelegramGatewayCode(sessionIdInput, codeInput, phoneInput) {
  const sessionId = asString(sessionIdInput).trim();
  const phone = normalizePhoneNumber(phoneInput);
  console.log("verify session_id:", sessionId || null);

  if (!sessionId && !phone) {
    throw { status: 400, message: "session_id_missing", code: "session_id_missing" };
  }

  const code = normalizeVerificationCode(codeInput);
  if (!code) {
    throw { status: 400, message: "Tasdiqlash kodi 6 ta raqam bo'lishi kerak" };
  }

  const admin = getAdminClient();
  const sessionById = sessionId ? await getVerificationSession(admin, sessionId) : null;
  const session = sessionById ?? (phone ? await getLatestPendingVerificationSession(admin, phone) : null);
  if (!session) {
    throw { status: 404, message: "session_not_found", code: "session_not_found" };
  }

  const resolvedSessionId = session.id;

  if (!session.request_id) {
    throw { status: 500, message: "request_id_missing", code: "request_id_missing" };
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await updateVerificationSession(admin, resolvedSessionId, { status: "expired" });
    throw { status: 410, message: "Tasdiqlash kodi muddati tugagan. Yangi kod so'rang" };
  }

  const gatewayResult = await callGateway("checkVerificationStatus", {
    request_id: session.request_id,
    code,
  });
  const verificationStatus = gatewayResult?.verification_status?.status?.trim();
  if (!verificationStatus) {
    throw { status: 502, message: "Telegram Gateway tasdiqlash holatini qaytarmadi" };
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
      throw { status: 404, message: "Bu raqamga biriktirilgan profil topilmadi" };
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

  const profile = session.profile_id ? await getProfileById(admin, session.profile_id, true) : null;
  if (!profile) {
    throw { status: 404, message: "Profil topilmadi" };
  }

  const phoneOwner = await getProfileByPhone(admin, session.phone, false);
  if (phoneOwner && phoneOwner.id !== profile.id) {
    throw { status: 409, message: "Bu telefon boshqa profilga biriktirilgan" };
  }

  await updateVerificationSession(admin, resolvedSessionId, {
    status: "completed",
    verified_at: verifiedAt,
  });
  const user = await updateProfile(admin, profile.id, {
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

async function registerWithVerifiedPhone(body) {
  const sessionId = asString(body.session_id).trim();
  if (!sessionId) {
    throw { status: 400, message: "session_id kiritilmadi" };
  }

  const phone = normalizePhoneNumber(body.phone);
  const firstName = normalizeName(body.first_name);
  const lastName = normalizeName(body.last_name);
  const birthDate = normalizeBirthDate(body.birth_date);
  const login = normalizeLogin(body.login);
  const password = normalizePassword(body.password);
  const avatarUrl = normalizeAvatarUrl(body.avatar_url);
  if (!phone || !firstName || !lastName || !birthDate || !login || !password) {
    throw { status: 400, message: "Ro'yxatdan o'tish uchun barcha maydonlarni to'g'ri kiriting" };
  }

  const admin = getAdminClient();
  const session = await getVerificationSession(admin, sessionId);
  if (!session) {
    throw { status: 404, message: "Tasdiqlash sessiyasi topilmadi" };
  }

  if (!isSignupPurpose(session.purpose)) {
    throw { status: 400, message: "Bu sessiya ro'yxatdan o'tish uchun emas" };
  }

  if (phone !== session.phone) {
    throw { status: 400, message: "Tasdiqlangan telefon raqami mos emas" };
  }

  if (session.status !== "verified") {
    throw { status: 400, message: "Avval telefon raqamingizni tasdiqlang" };
  }

  const phoneOwnerId = await getProfileIdByPhone(admin, session.phone);
  if (phoneOwnerId) {
    throw { status: 409, message: REGISTER_PHONE_EXISTS_MESSAGE, code: "phone_exists" };
  }

  const loginOwnerId = await getProfileIdByLogin(admin, login);
  if (loginOwnerId) {
    throw { status: 409, message: "Bu login allaqachon band" };
  }

  const now = new Date().toISOString();
  const fullName = `${firstName} ${lastName}`.trim();
  const inserted = await admin
    .from("profiles")
    .insert({
      id: randomUUID(),
      role: "user",
      phone: session.phone,
      phone_verified: true,
      telegram_gateway_verified_at: session.verified_at ?? now,
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      login,
      password_hash: hashPassword(password),
      avatar_url: avatarUrl,
      full_name: fullName,
      updated_at: now,
    })
    .select(PUBLIC_PROFILE_COLUMNS)
    .single();

  if (inserted.error || !inserted.data) {
    await ensureProfileAuthColumns(admin, inserted.error);

    if (/duplicate key value/i.test(inserted.error?.message || "") && /login/i.test(inserted.error?.message || "")) {
      throw { status: 409, message: "Bu login allaqachon band" };
    }

    if (/duplicate key value/i.test(inserted.error?.message || "") && /phone/i.test(inserted.error?.message || "")) {
      throw { status: 409, message: REGISTER_PHONE_EXISTS_MESSAGE, code: "phone_exists" };
    }

    throw { status: 500, message: "Profil yaratib bo'lmadi" };
  }

  await updateVerificationSession(admin, session.id, {
    status: "completed",
    profile_id: inserted.data.id,
  });

  return sanitizeProfile(inserted.data);
}

async function loginWithPassword(loginInput, passwordInput) {
  const login = normalizeLogin(loginInput);
  const password = normalizePassword(passwordInput);
  if (!login || !password) {
    throw { status: 400, message: "Login va parolni to'g'ri kiriting" };
  }

  const admin = getAdminClient();
  const profile = await getProfileByLogin(admin, login);
  if (!profile || !verifyPassword(password, profile.password_hash)) {
    throw { status: 401, message: "Login yoki parol noto'g'ri" };
  }

  return sanitizeProfile(profile);
}

async function resetPasswordWithVerifiedPhone(sessionIdInput, passwordInput) {
  const sessionId = asString(sessionIdInput).trim();
  if (!sessionId) {
    throw { status: 400, message: "session_id kiritilmadi" };
  }

  const password = normalizePassword(passwordInput);
  if (!password) {
    throw { status: 400, message: `Parol kamida ${PASSWORD_MIN_LENGTH} ta belgidan iborat bo'lishi kerak` };
  }

  const admin = getAdminClient();
  const session = await getVerificationSession(admin, sessionId);
  if (!session) {
    throw { status: 404, message: "session_not_found", code: "session_not_found" };
  }

  if (session.purpose !== "recovery") {
    throw { status: 400, message: "Bu sessiya parolni tiklash uchun emas" };
  }

  if (session.status !== "verified") {
    throw { status: 400, message: "Avval Telegram kodini tasdiqlang" };
  }

  const profile = session.profile_id
    ? await getProfileById(admin, session.profile_id, true)
    : await getProfileByPhone(admin, session.phone, true);
  if (!profile) {
    throw { status: 404, message: "Bu raqamga biriktirilgan profil topilmadi" };
  }

  const now = new Date().toISOString();
  const user = await updateProfile(admin, profile.id, {
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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject({ status: 400, message: "Invalid JSON body" });
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    jsonResponse(res, 404, { error: "Not found" });
    return;
  }

  if (req.method === "OPTIONS") {
    jsonResponse(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if ((url.pathname === "/api/auth/telegram/send" || url.pathname === "/api/auth/telegram-gateway/send") && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = await sendTelegramGatewayCode(body.phone, {
        purpose: body.purpose,
        user_id: body.user_id,
        current_password: body.current_password,
      });
      jsonResponse(res, 200, result);
      return;
    }

    if ((url.pathname === "/api/auth/telegram/verify" || url.pathname === "/api/auth/telegram-gateway/verify") && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = await verifyTelegramGatewayCode(body.session_id, body.code, body.phone);
      jsonResponse(res, 200, { success: true, ...result });
      return;
    }

    if ((url.pathname === "/api/auth/register" || url.pathname === "/api/auth/register-complete") && req.method === "POST") {
      const body = await readJsonBody(req);
      const user = await registerWithVerifiedPhone(body);
      jsonResponse(res, 200, { success: true, user });
      return;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const user = await loginWithPassword(body.login, body.password);
      jsonResponse(res, 200, { success: true, user });
      return;
    }

    if (url.pathname === "/api/auth/password/reset" && req.method === "POST") {
      const body = await readJsonBody(req);
      const user = await resetPasswordWithVerifiedPhone(body.session_id, body.password);
      jsonResponse(res, 200, { success: true, user });
      return;
    }

    jsonResponse(res, 404, { error: "Not found" });
  } catch (error) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const message = typeof error?.message === "string" ? error.message : "Telegram Gateway request failed";
    const code = typeof error?.code === "string" ? error.code : undefined;
    console.error("[telegram-auth-server]", error);
    if (code === "session_not_found" || message === "session_not_found") {
      jsonResponse(res, status, { success: false, error: "session_not_found" });
      return;
    }

    jsonResponse(res, status, code ? { error: message, code } : { error: message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[telegram-auth-server] listening on http://0.0.0.0:${PORT}`);
});