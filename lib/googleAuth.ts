import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { fetchAuthJson } from "@/lib/authApi";
import { supabase } from "@/lib/supabase";
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

export function getGoogleRedirectTo(): string {
  if (Platform.OS === "web") {
    return "http://localhost:8081/auth/callback";
  }

  return "exp://172.20.10.3:8081/--/auth/callback";
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

export async function beginGoogleSignInOnWeb(): Promise<void> {
  const redirectTo = getGoogleRedirectTo();
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

  window.location.assign(data.url);
}

export async function beginGoogleSignInOnMobile(): Promise<string> {
  const redirectTo = getGoogleRedirectTo();
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

  const { response: res, body } = await fetchAuthJson<{ profile?: UserProfile; error?: string }>(
    "/api/auth/google/profile",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok || !body.profile) {
    throw new Error(body.error || "Profilni yangilashda xatolik yuz berdi");
  }

  return body.profile;
}

export async function clearSupabaseAuth(): Promise<void> {
  await supabase.auth.signOut();
}