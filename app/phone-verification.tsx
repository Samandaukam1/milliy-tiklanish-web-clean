import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PhoneVerification } from "@/components/PhoneVerification";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import type { UserProfile } from "@/lib/types";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";

export default function PhoneVerificationScreen() {
  const params = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, login, pendingPhoneLinkPassword, clearPhoneLinkPassword } = useApp();
  const source = params.source === "register" ? "register" : "profile";

  const closeScreen = useCallback(() => {
    clearPhoneLinkPassword();
    router.replace("/(tabs)/profile");
  }, [clearPhoneLinkPassword]);

  const handleVerified = useCallback(
    (profile: UserProfile) => {
      login(profile);
      clearPhoneLinkPassword();
      router.replace("/(tabs)/profile");
    },
    [clearPhoneLinkPassword, login]
  );

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable onPress={closeScreen} style={[styles.backButton, { top: insets.top + 12 }]}> 
        <ArrowLeft size={20} color={colors.text} />
      </Pressable>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 84, paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.content}>
          {user ? (
            <PhoneVerification
              userId={user.id}
              initialPhone={user.phone}
              initialPassword={pendingPhoneLinkPassword}
              onVerified={handleVerified}
              onSkip={closeScreen}
            />
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Telefon biriktirish uchun avval tizimga kiring</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{"Ro'yxatdan o'tish yoki kirish amalga oshgach, telefonni shu yerdan bog'lashingiz mumkin."}</Text>
              <Pressable onPress={() => router.replace(source === "register" ? "/register" : "/login")} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{"Kirish sahifasiga o'tish"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
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
    maxWidth: 620,
    width: "100%",
  },
  emptyCard: {
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    padding: 24,
  },
  emptyTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: 24,
    lineHeight: 31,
  },
  emptySubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: Palette.red,
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: Palette.white,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "700",
  },
});