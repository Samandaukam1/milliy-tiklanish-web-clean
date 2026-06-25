import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { supabase, loadSupabaseProfile, upsertSupabaseProfile } from "@/lib/supabase";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";

// Auth callback page for Google OAuth (PKCE redirect flow).
//
// Why this page does its own work instead of relying solely on AppProvider:
// - detectSessionInUrl: true in supabase.ts means Supabase auto-exchanges the
//   OAuth code on page load. On mobile Safari the resulting SIGNED_IN event can
//   fire before AppProvider registers its onAuthStateChange listener, causing the
//   event to be missed and this page to time out.
// - Fix: register our own listener + immediately poll getSession() + manually
//   call exchangeCodeForSession(code) as a last-resort fallback.

function normalizeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const TIMEOUT_MS = 20000;
const POLL_MS = 3000;

export default function AuthCallbackScreen() {
  const colors = useColors();
  const { login } = useApp();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
    next?: string;
  }>();

  const [timedOut, setTimedOut] = useState(false);
  const redirectedRef = useRef(false);

  // Refs keep callbacks stable without needing them in dependency arrays.
  const loginRef = useRef(login);
  loginRef.current = login;

  const nextPath = useMemo(
    () => normalizeParam(params.next) ?? "/subscribe",
    [params.next]
  );
  const nextPathRef = useRef(nextPath);
  nextPathRef.current = nextPath;

  const code = useMemo(() => normalizeParam(params.code), [params.code]);

  const authError = useMemo(
    () => normalizeParam(params.error_description) ?? normalizeParam(params.error),
    [params.error, params.error_description]
  );

  // Called once we have a confirmed Supabase session.
  // Upserts the profile row, syncs AppProvider via login(), then navigates.
  const finishWithSession = useCallback(async (session: { user: any } | null) => {
    if (redirectedRef.current || !session?.user) return;
    redirectedRef.current = true;

    const authUser = session.user;
    try {
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

      let profile = await upsertSupabaseProfile(authUser.id, patch);
      if (!profile) profile = await loadSupabaseProfile(authUser.id);
      if (profile) loginRef.current(profile);
    } catch {
      try {
        const existing = await loadSupabaseProfile(authUser.id);
        if (existing) loginRef.current(existing);
      } catch {
        // Profile sync failed — navigate anyway; AppProvider re-syncs on next load.
      }
    }

    router.replace(nextPathRef.current as any);
  }, []);

  useEffect(() => {
    if (authError) return;

    // 1. Immediate check — detectSessionInUrl may have already handled the code.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finishWithSession(data.session);
    });

    // 2. Manual code exchange — fallback for when detectSessionInUrl did not fire.
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!error && data.session) {
          finishWithSession(data.session);
        } else {
          // Code was already consumed by detectSessionInUrl — re-check session.
          supabase.auth.getSession().then(({ data: s }) => {
            if (s.session) finishWithSession(s.session);
          });
        }
      });
    }

    // 3. Auth state change listener — catches SIGNED_IN fired after mount.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        finishWithSession(session);
      }
    });

    // 4. Extra poll at POLL_MS for mobile Safari (BFCache / slow JS init).
    const poll = setTimeout(() => {
      if (!redirectedRef.current) {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) finishWithSession(data.session);
        });
      }
    }, POLL_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(poll);
    };
  }, [authError, code, finishWithSession]);

  // Timeout safety net — reveal fallback UI after TIMEOUT_MS.
  useEffect(() => {
    if (authError) return;
    const t = setTimeout(() => {
      if (!redirectedRef.current) setTimedOut(true);
    }, TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [authError]);

  const handleRetry = useCallback(() => {
    setTimedOut(false);
    redirectedRef.current = false;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        finishWithSession(data.session);
      } else {
        router.replace("/login" as any);
      }
    });
  }, [finishWithSession]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {authError ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Kirish amalga oshmadi</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{authError}</Text>
            <Pressable onPress={() => router.replace("/login" as any)} style={styles.btn}>
              <Text style={styles.btnText}>Kirish oynasiga qaytish</Text>
            </Pressable>
          </>
        ) : timedOut ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>{"Kirish jarayoni to'xtatildi"}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {"Ulanish uzoq davom etdi. Qayta urinib ko'ring."}
            </Text>
            <Pressable onPress={handleRetry} style={styles.btn}>
              <Text style={styles.btnText}>Qayta urinish</Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace("/" as any)}
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border }]}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>Bosh sahifaga qaytish</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={Palette.red} size="large" />
            <Text style={[styles.title, { color: colors.text }]}>Google orqali kirilmoqda...</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Profilingiz tayyorlanmoqda
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    width: "100%",
    marginTop: 4,
    backgroundColor: Palette.red,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  btnText: {
    color: Palette.white,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: Fonts.sans,
  },
});
