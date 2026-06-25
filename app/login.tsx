import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, KeyRound, ShieldCheck, Sparkles } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { loginUser, normalizeLoginValue } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/googleAuth";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";

type LoginMode = "entry" | "signin";

export default function LoginScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { login } = useApp();
  const [mode, setMode] = useState<LoginMode>(params.mode === "signin" ? "signin" : "entry");
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    setMode(params.mode === "signin" ? "signin" : "entry");
  }, [params.mode]);

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle("/subscribe");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google orqali kirishda xatolik yuz berdi");
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const profile = await loginUser(normalizeLoginValue(loginValue), password);
      login(profile);
      router.replace("/(tabs)/profile");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login yoki parol noto'g'ri");
    } finally {
      setLoading(false);
    }
  }, [login, loginValue, password]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable onPress={() => router.back()} style={[styles.backButton, { top: insets.top + 12 }]}> 
        <ArrowLeft size={20} color={colors.text} />
      </Pressable>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 84, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={[styles.badge, { backgroundColor: mode === "signin" ? Palette.red : Palette.black }]}> 
              {mode === "signin" ? <KeyRound size={30} color={Palette.white} /> : <ShieldCheck size={30} color={Palette.white} />}
            </View>

            <Text style={[styles.title, { color: colors.text }]}>
              {mode === "signin" ? "Mening akkountim bor" : "Ro'yxatdan o'tish / Kirish"}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}> 
              {mode === "signin"
                ? "Login va parol orqali profilingizga kiring."
                : "Gazeta profilini yarating yoki mavjud akkountingiz bilan tizimga kiring."}
            </Text>

            {mode === "entry" ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <View style={styles.heroRow}>
                  <Sparkles size={18} color={Palette.red} />
                  <Text style={[styles.heroEyebrow, { color: colors.textSecondary }]}>Profil imkoniyatlari</Text>
                </View>

                <Text style={[styles.cardTitle, { color: colors.text }]}>Maqolalarni saqlang, qiziqishlaringizni tanlang va profilingizni himoyalang</Text>
                <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{"Yangi foydalanuvchilar uchun to'liq ro'yxatdan o'tish formasi va mavjud akkountlar uchun tezkor kirish mavjud."}</Text>

                <Pressable onPress={() => router.push({ pathname: "/register" })} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.primaryButtonText}>{"Ro'yxatdan o'tish"}</Text>
                </Pressable>

                <Pressable
                  onPress={() => setMode("signin")}
                  style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border }, pressed && styles.secondaryPressed]}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Mening akkountim bor</Text>
                </Pressable>

                <Pressable onPress={() => router.push("/telegram-login?mode=recovery")} style={styles.linkButton}>
                  <Text style={[styles.linkButtonText, { color: colors.textSecondary }]}>Parolni tiklash</Text>
                </Pressable>

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textMuted }]}>yoki</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <Pressable
                  onPress={handleGoogleSignIn}
                  disabled={googleLoading}
                  style={({ pressed }) => [styles.googleButton, (pressed || googleLoading) && styles.buttonPressed]}
                >
                  {googleLoading ? (
                    <ActivityIndicator color={Palette.white} />
                  ) : (
                    <>
                      <Text style={styles.googleButtonG}>G</Text>
                      <Text style={styles.googleButtonText}>Google orqali kirish</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <Text style={[styles.inputLabel, { color: colors.text }]}>Login</Text>
                <TextInput
                  value={loginValue}
                  onChangeText={(value) => setLoginValue(normalizeLoginValue(value))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="login"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>Parol</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Parol"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Pressable onPress={handleSubmit} disabled={loading} style={({ pressed }) => [styles.primaryButton, (pressed || loading) && styles.buttonPressed]}>
                  {loading ? <ActivityIndicator color={Palette.white} /> : <Text style={styles.primaryButtonText}>Kirish</Text>}
                </Pressable>

                <Pressable
                  onPress={() => router.push({ pathname: "/register" })}
                  style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border }, pressed && styles.secondaryPressed]}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{"Ro'yxatdan o'tish"}</Text>
                </Pressable>

                <Pressable onPress={() => router.push("/telegram-login?mode=recovery")} style={styles.linkButton}>
                  <Text style={[styles.linkButtonText, { color: colors.textSecondary }]}>Parolni tiklash</Text>
                </Pressable>

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textMuted }]}>yoki</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <Pressable
                  onPress={handleGoogleSignIn}
                  disabled={googleLoading}
                  style={({ pressed }) => [styles.googleButton, (pressed || googleLoading) && styles.buttonPressed]}
                >
                  {googleLoading ? (
                    <ActivityIndicator color={Palette.white} />
                  ) : (
                    <>
                      <Text style={styles.googleButtonG}>G</Text>
                      <Text style={styles.googleButtonText}>Google orqali kirish</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: Palette.white,
    borderColor: Palette.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    left: 20,
    position: "absolute",
    width: 44,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  content: {
    alignSelf: "center",
    gap: 18,
    maxWidth: 560,
    width: "100%",
  },
  badge: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 28,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: 31,
    lineHeight: 38,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  card: {
    borderRadius: 30,
    borderWidth: 1,
    gap: 14,
    padding: 24,
    shadowColor: Palette.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 5,
  },
  heroRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  heroEyebrow: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: 24,
    lineHeight: 31,
  },
  cardBody: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  inputLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    fontFamily: Fonts.sans,
    fontSize: 15,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: Palette.red,
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: Palette.white,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "700",
  },
  linkButton: {
    alignSelf: "center",
    paddingTop: 4,
  },
  linkButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  secondaryPressed: {
    opacity: 0.78,
  },
  errorText: {
    color: Palette.red,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#4285F4",
    borderRadius: 18,
    minHeight: 54,
    paddingHorizontal: 20,
  },
  googleButtonG: {
    color: Palette.white,
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24,
  },
  googleButtonText: {
    color: Palette.white,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
});