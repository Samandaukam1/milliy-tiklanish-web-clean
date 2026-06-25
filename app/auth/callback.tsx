import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";

// Auth callback — Supabase detects the code/token in the URL automatically
// (detectSessionInUrl: true in supabase.ts). AppProvider's onAuthStateChange
// fires SIGNED_IN and calls login(profile), which sets `user` in context.
// We just watch `user` and redirect to `next` once it appears.

function normalizeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const TIMEOUT_MS = 15000;

export default function AuthCallbackScreen() {
  const colors = useColors();
  const { user } = useApp();
  const params = useLocalSearchParams<{
    error?: string;
    error_description?: string;
    next?: string;
  }>();

  const [timedOut, setTimedOut] = useState(false);
  const redirectedRef = useRef(false);

  const nextPath = useMemo(
    () => normalizeParam(params.next) ?? "/subscribe",
    [params.next]
  );
  const authError = useMemo(
    () => normalizeParam(params.error_description) ?? normalizeParam(params.error),
    [params.error, params.error_description]
  );

  // Redirect as soon as AppProvider sets the user after SIGNED_IN event
  useEffect(() => {
    if (authError || redirectedRef.current) return;
    if (user) {
      redirectedRef.current = true;
      router.replace(nextPath as any);
    }
  }, [user, nextPath, authError]);

  // 15 s safety-net timeout
  useEffect(() => {
    if (authError || user) return;
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [authError, user]);

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
            <Text style={[styles.title, { color: colors.text }]}>Kirish jarayoni to'xtatildi</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {"Ulanish uzoq davom etdi. Qayta urinib ko'ring."}
            </Text>
            <Pressable onPress={() => router.replace("/login" as any)} style={styles.btn}>
              <Text style={styles.btnText}>Qayta urinish</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={Palette.red} />
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
    padding: 24,
    alignItems: "center",
    gap: 12,
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
    marginTop: 8,
    backgroundColor: Palette.red,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: Palette.white,
    fontSize: 14,
    fontWeight: "700",
  },
});
