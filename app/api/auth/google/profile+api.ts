import { createClient } from "@supabase/supabase-js";
import { readSubscriptionInfo } from "@/lib/server/subscriptions";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function getDisplayName(user: any): string | null {
  return (
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : null) ??
    null
  );
}

function getAvatarUrl(user: any): string | null {
  return user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null;
}

async function upsertProfile(admin: any, payload: Record<string, unknown>) {
  return await (admin
    .from("profiles") as any)
    .upsert(payload, {
      onConflict: "id",
      ignoreDuplicates: false,
    })
    .select("id, phone, phone_verified, telegram_verified_at, name, email, avatar_url, provider, subscription, created_at, updated_at")
    .single();
}

export async function POST(request: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[google-profile] Missing required environment variables");
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

  if (authError || !user) {
    console.error("[google-profile] Invalid access token:", authError);
    return Response.json({ error: "Google foydalanuvchisi tasdiqlanmadi" }, { status: 401 });
  }

  const provider = user.app_metadata?.provider ?? "google";
  if (provider !== "google") {
    return Response.json({ error: "Faqat Google OAuth qo'llab-quvvatlanadi" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const email = user.email ?? null;
  const profilePayload = {
    id: user.id,
    phone: user.phone || email || `google:${user.id}`,
    phone_verified: Boolean(user.phone),
    telegram_verified_at: null,
    name: getDisplayName(user),
    email,
    avatar_url: getAvatarUrl(user),
    provider: "google",
    updated_at: now,
  };

  let result: any = await upsertProfile(admin as any, profilePayload);

  if (result.error) {
    const message = result.error.message || "";
    const missingColumns = /column .* does not exist|schema cache/i.test(message);
    if (!missingColumns) {
      console.error("[google-profile] Profile upsert error:", result.error);
      return Response.json({ error: "Profil yaratishda xatolik" }, { status: 500 });
    }

    result = await (admin
      .from("profiles") as any)
      .upsert(
        {
          id: user.id,
          phone: user.phone || email || `google:${user.id}`,
          phone_verified: Boolean(user.phone),
          telegram_verified_at: null,
          name: getDisplayName(user),
          avatar_url: getAvatarUrl(user),
          updated_at: now,
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        }
      )
      .select("id, phone, phone_verified, telegram_verified_at, name, avatar_url, subscription, created_at, updated_at")
      .single();

    if (result.error || !result.data) {
      console.error("[google-profile] Fallback upsert error:", result.error);
      return Response.json({ error: "Profil yaratishda xatolik" }, { status: 500 });
    }

    const subscriptionInfo = await readSubscriptionInfo(admin as any, result.data.id, (result.data as any).subscription);

    return Response.json({
      profile: {
        ...result.data,
        email,
        provider: "google",
        subscription: subscriptionInfo.plan,
        subscription_info: subscriptionInfo,
      },
    });
  }

  const subscriptionInfo = await readSubscriptionInfo(admin as any, result.data.id, (result.data as any).subscription);

  return Response.json({
    profile: {
      ...result.data,
      subscription: subscriptionInfo.plan,
      subscription_info: subscriptionInfo,
    },
  });
}