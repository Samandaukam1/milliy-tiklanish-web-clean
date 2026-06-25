import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { completeGoogleSignIn } from "@/lib/googleAuth";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";

function normalizeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function AuthCallbackScreen() {
  const colors = useColors();
  const { login } = useApp();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string; next?: string }>();
  const [error, setError] = useState<string>("");
  const handledRef = useRef(false);

  const code = useMemo(() => normalizeParam(params.code), [params.code]);
  const authError = useMemo(
    () => normalizeParam(params.error_description) ?? normalizeParam(params.error),
    [params.error, params.error_description]
  );
  const nextPath = useMemo(() => normalizeParam(params.next) ?? "/(tabs)/profile", [params.next]);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    if (authError) {
      setError(authError);
      return;
    }

    if (!code) {
      setError("Google tasdiqlash kodi topilmadi");
      return;
    }

    let mounted = true;
    completeGoogleSignIn(code)
      .then((profile) => {
        if (!mounted) return;
        login(profile);
        router.replace(nextPath as any);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Google orqali kirishda xatolik yuz berdi");
      });

    return () => {
      mounted = false;
    };
  }, [authError, code, login, nextPath]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        {!error ? (
          <>
            <ActivityIndicator color={Palette.red} />
            <Text style={[styles.title, { color: colors.text }]}>Google orqali kirilmoqda...</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Profilingiz tayyorlanmoqda</Text>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Kirish amalga oshmadi</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{error}</Text>
            <Pressable onPress={() => router.replace("/login")} style={styles.btn}>
              <Text style={styles.btnText}>Kirish oynasiga qaytish</Text>
            </Pressable>
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
    fontSize: 24,
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
    paddingVertical: 12,
  },
  btnText: {
    color: Palette.white,
    fontSize: 14,
    fontWeight: "700",
  },
});