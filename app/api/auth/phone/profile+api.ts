import { createClient } from "@supabase/supabase-js";
import { readSubscriptionInfo } from "@/lib/server/subscriptions";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type PhoneProfilePayload = {
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
};

function normalizeNamePart(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeBirthDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function needsRegistration(profile: Record<string, any> | null): boolean {
  if (!profile) {
    return true;
  }

  return !profile.first_name && !profile.last_name && !profile.full_name && !profile.name;
}

async function selectProfile(admin: ReturnType<typeof createClient>, userId: string) {
  return await (admin
    .from("profiles") as any)
    .select(
      "id, phone, phone_verified, telegram_verified, telegram_verified_at, telegram_gateway_verified_at, telegram_id, telegram_username, full_name, first_name, last_name, birth_date, login, name, email, avatar_url, provider, subscription, created_at, updated_at"
    )
    .eq("id", userId)
    .maybeSingle();
}

async function upsertProfile(admin: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  return await (admin
    .from("profiles") as any)
    .upsert(payload, {
      onConflict: "id",
      ignoreDuplicates: false,
    })
    .select(
      "id, phone, phone_verified, telegram_verified, telegram_verified_at, telegram_gateway_verified_at, telegram_id, telegram_username, full_name, first_name, last_name, birth_date, login, name, email, avatar_url, provider, subscription, created_at, updated_at"
    )
    .single();
}

export async function POST(request: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[phone-profile] Missing required environment variables");
    return Response.json({ error: "Server configuration error" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return Response.json({ error: "Authorization token topilmadi" }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  const user = authData?.user;

  if (authError || !user || !user.phone) {
    console.error("[phone-profile] Invalid access token:", authError);
    return Response.json({ error: "Telefon foydalanuvchisi tasdiqlanmadi" }, { status: 401 });
  }

  let body: PhoneProfilePayload = {};
  try {
    body = (await request.json()) as PhoneProfilePayload;
  } catch {
    body = {};
  }

  const existingResult = await selectProfile(admin, user.id);
  if (existingResult.error) {
    console.error("[phone-profile] Failed to read profile:", existingResult.error);
    return Response.json({ error: "Profilni o'qib bo'lmadi" }, { status: 500 });
  }

  const existingProfile = existingResult.data ?? null;
  const firstName = normalizeNamePart(body.first_name) ?? existingProfile?.first_name ?? null;
  const lastName = normalizeNamePart(body.last_name) ?? existingProfile?.last_name ?? null;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || existingProfile?.full_name || existingProfile?.name || null;
  const birthDate = normalizeBirthDate(body.birth_date) ?? existingProfile?.birth_date ?? null;
  const now = new Date().toISOString();

  const profilePayload = {
    id: user.id,
    phone: user.phone,
    phone_verified: true,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    name: fullName,
    birth_date: birthDate,
    email: user.email ?? existingProfile?.email ?? null,
    avatar_url: existingProfile?.avatar_url ?? null,
    provider: "phone",
    updated_at: now,
  };

  const result = await upsertProfile(admin, profilePayload);
  if (result.error || !result.data) {
    console.error("[phone-profile] Profile upsert error:", result.error);
    return Response.json({ error: "Profilni saqlab bo'lmadi" }, { status: 500 });
  }

  const subscriptionInfo = await readSubscriptionInfo(admin as any, result.data.id, (result.data as any).subscription);

  return Response.json({
    profile: {
      ...result.data,
      subscription: subscriptionInfo.plan,
      subscription_info: subscriptionInfo,
    },
    isNew: needsRegistration(existingProfile),
  });
}