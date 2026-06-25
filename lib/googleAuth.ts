import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase, loadSupabaseProfile, upsertSupabaseProfile } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

WebBrowser.maybeCompleteAuthSession();

function decodeMessage(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function getGoogleRedirectTo(next?: string | null): string {
  if (Platform.OS === "web") {
    const base =
      typeof window !== "undefined" && window.location.origin
        ? `${window.location.origin}/auth/callback`
        : "/auth/callback";
    return next ? `${base}?next=${encodeURIComponent(next)}` : base;
  }
  return "rork-app://auth/callback";
}

export function getOAuthCodeFromUrl(url: string): string | null {
  const parsed = Linking.parse(url);
  const fromQuery = parsed.queryParams?.code;
  if (typeof fromQuery === "string" && fromQuery.length > 0) {
    return fromQuery;
  }

  const hash = url.split("#")[1] ?? "";
  const params = new URLSearchParams(hash);
  return params.get("code");
}

export function getOAuthErrorFromUrl(url: string): string | null {
  const parsed = Linking.parse(url);
  const directError = parsed.queryParams?.error_description ?? parsed.queryParams?.error;
  if (typeof directError === "string") {
    return decodeMessage(directError);
  }

  const hash = url.split("#")[1] ?? "";
  const params = new URLSearchParams(hash);
  return decodeMessage(params.get("error_description") ?? params.get("error"));
}

export async function beginGoogleSignInOnWeb(next?: string | null): Promise<void> {
  const redirectTo = getGoogleRedirectTo(next);
  console.log("GOOGLE OAUTH redirectTo =", redirectTo);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw new Error(error.message || "Google orqali kirishda xatolik yuz berdi");
  }

  if (!data?.url) {
    throw new Error("Google avtorizatsiya havolasi topilmadi");
  }

  window.location.href = data.url;
}

export async function beginGoogleSignInOnMobile(): Promise<string> {
  const redirectTo = getGoogleRedirectTo(null);
  console.log("GOOGLE OAUTH redirectTo =", redirectTo);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    throw new Error(error?.message || "Google orqali kirishda xatolik yuz berdi");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  console.log("GOOGLE OAUTH result =", result);
  if (result.type !== "success" || !("url" in result) || !result.url) {
    if (result.type === "cancel" || result.type === "dismiss") {
      throw new Error("Google orqali kirish bekor qilindi");
    }
    throw new Error("Google orqali kirishda xatolik yuz berdi");
  }

  return result.url;
}

export async function completeGoogleSignIn(code: string): Promise<UserProfile> {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    throw new Error(error.message || "Google sessiyasini yakunlashda xatolik yuz berdi");
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Google sessiyasi topilmadi");
  }

  const authUser = data.session?.user;
  if (!authUser) {
    throw new Error("Google sessiyasi foydalanuvchisi topilmadi");
  }

  // Build the profile patch from OAuth user metadata, then upsert directly
  // via Supabase client — no server API call needed.
  const displayName: string | null =
    authUser.user_metadata?.full_name ??
    authUser.user_metadata?.name ??
    (typeof authUser.email === "string" ? authUser.email.split("@")[0] : null) ??
    null;

  const avatarUrl: string | null =
    authUser.user_metadata?.avatar_url ??
    authUser.user_metadata?.picture ??
    null;

  const patch: Record<string, unknown> = {
    phone: authUser.phone || authUser.email || `google:${authUser.id}`,
    phone_verified: Boolean(authUser.phone),
    name: displayName,
    email: authUser.email ?? null,
    avatar_url: avatarUrl,
    provider: "google",
  };

  const profile = await upsertSupabaseProfile(authUser.id, patch);
  if (!profile) {
    // Upsert failed — still try a plain read as graceful fallback
    const existing = await loadSupabaseProfile(authUser.id);
    if (existing) return existing;
    throw new Error("Profilni yangilashda xatolik yuz berdi");
  }

  return profile;
}

export async function clearSupabaseAuth(): Promise<void> {
  await supabase.auth.signOut();
}