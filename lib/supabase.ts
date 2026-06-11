import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import type { UserProfile, SubscriptionInfo, SubscriptionPlan } from "@/lib/types";

type SupabaseProfileError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

export type UpsertSupabaseProfileResult = {
  profile: UserProfile | null;
  error: SupabaseProfileError | null;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const PROFILE_AVATARS_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_PROFILE_AVATARS_BUCKET ?? "profile-avatars";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On web: persist the Supabase session in localStorage so the user
    // remains logged in across page reloads without an API round-trip.
    // On native: keep using the custom AsyncStorage-based persistence
    // managed by AppProvider (persistSession: false avoids double-storage).
    persistSession: Platform.OS === "web",
    autoRefreshToken: Platform.OS === "web",
    detectSessionInUrl: Platform.OS === "web",
    flowType: "pkce",
  },
});

// ─── Direct Supabase profile loader ──────────────────────────────────────────
// Used by AppProvider and completeGoogleSignIn so pages never call
// /api/auth/... endpoints (which are not deployed in static export mode).

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeProfileRow(row: Record<string, unknown>): UserProfile {
  const plan = asStr(row.subscription) as SubscriptionPlan | null;
  const subscriptionInfo: SubscriptionInfo = {
    plan: (plan === "premium" || plan === "pro") ? plan : "free",
    status: "active",
    starts_at: asStr(row.subscription_starts_at),
    expires_at: asStr(row.subscription_expires_at),
  };

  return {
    id: String(row.id ?? ""),
    phone: asStr(row.phone),
    phone_verified: Boolean(row.phone_verified),
    telegram_verified: (row.telegram_verified as boolean | null) ?? null,
    telegram_verified_at: asStr(row.telegram_verified_at),
    telegram_gateway_verified_at: asStr(row.telegram_gateway_verified_at) ?? undefined,
    telegram_id: asStr(row.telegram_id) ?? undefined,
    telegram_username: asStr(row.telegram_username) ?? undefined,
    full_name: asStr(row.full_name) ?? undefined,
    first_name: asStr(row.first_name) ?? undefined,
    last_name: asStr(row.last_name) ?? undefined,
    birth_date: asStr(row.birth_date) ?? undefined,
    login: asStr(row.login) ?? undefined,
    name: asStr(row.name),
    email: asStr(row.email) ?? undefined,
    avatar_url: asStr(row.avatar_url),
    provider: asStr(row.provider) ?? undefined,
    subscription: subscriptionInfo.plan,
    subscription_info: subscriptionInfo,
    created_at: asStr(row.created_at) ?? new Date().toISOString(),
    updated_at: asStr(row.updated_at) ?? new Date().toISOString(),
  };
}

const PROFILE_SELECT =
  "id, phone, phone_verified, telegram_verified, telegram_verified_at, telegram_gateway_verified_at, telegram_id, telegram_username, full_name, first_name, last_name, birth_date, login, name, email, avatar_url, provider, subscription, created_at, updated_at";

const PROFILE_UPSERT_COLUMNS = new Set([
  "id",
  "phone",
  "login",
  "password_hash",
  "phone_verified",
  "telegram_verified",
  "telegram_verified_at",
  "telegram_gateway_verified_at",
  "telegram_id",
  "telegram_username",
  "full_name",
  "first_name",
  "last_name",
  "birth_date",
  "name",
  "email",
  "avatar_url",
  "provider",
  "subscription",
  "updated_at",
]);

function toSupabaseProfileError(error: unknown): SupabaseProfileError {
  const candidate = (error ?? {}) as Record<string, unknown>;
  return {
    message: typeof candidate.message === "string" ? candidate.message : "Unknown Supabase error",
    details: typeof candidate.details === "string" ? candidate.details : undefined,
    hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
  };
}

function extractMissingColumnName(error: SupabaseProfileError): string | null {
  const text = `${error.message} ${error.details ?? ""}`;
  const match = text.match(/column\s+['\"]?([a-zA-Z0-9_]+)['\"]?\s+does\s+not\s+exist/i);
  return match?.[1] ?? null;
}

function filterToKnownProfileColumns(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([column]) => PROFILE_UPSERT_COLUMNS.has(column)));
}

export async function upsertSupabaseProfileWithDetails(
  userId: string,
  patch: Record<string, unknown>
): Promise<UpsertSupabaseProfileResult> {
  try {
    const payload = filterToKnownProfileColumns({ id: userId, ...patch, updated_at: new Date().toISOString() });
    let lastError: SupabaseProfileError | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await (supabase.from("profiles") as any)
        .upsert(payload, { onConflict: "id", ignoreDuplicates: false })
        .select(PROFILE_SELECT)
        .single();

      if (!error && data) {
        return { profile: normalizeProfileRow(data as Record<string, unknown>), error: null };
      }

      if (!error) {
        return { profile: null, error: { message: "Profil ma'lumoti bo'sh qaytdi" } };
      }

      lastError = toSupabaseProfileError(error);
      const missingColumn = extractMissingColumnName(lastError);
      if (!missingColumn || missingColumn === "id" || !(missingColumn in payload)) {
        break;
      }

      delete payload[missingColumn];
    }

    return { profile: null, error: lastError };
  } catch (error) {
    return { profile: null, error: toSupabaseProfileError(error) };
  }
}

// Look up the real email stored in public.profiles for a given username.
// Used by all login flows to map login → Supabase Auth email.
// Requires RLS to allow anon SELECT on profiles.email / profiles.login.
export async function lookupEmailByLogin(login: string): Promise<string | null> {
  try {
    const { data } = await (supabase.from("profiles") as any)
      .select("email")
      .eq("login", login.toLowerCase().trim())
      .maybeSingle();
    return typeof data?.email === "string" && data.email.includes("@") ? data.email : null;
  } catch {
    return null;
  }
}

export async function loadSupabaseProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await (supabase.from("profiles") as any)
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return null;
    return normalizeProfileRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function upsertSupabaseProfile(
  userId: string,
  patch: Record<string, unknown>
): Promise<UserProfile | null> {
  const result = await upsertSupabaseProfileWithDetails(userId, patch);
  return result.profile;
}
