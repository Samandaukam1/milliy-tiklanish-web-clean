import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, StyleSheet, Platform, Pressable, Text, Image, useWindowDimensions } from "react-native";
import { Search, Bell, User, Send } from "lucide-react-native";
import logo from "../assets/images/milliy-tiklanish-logo.jpg";
import { AppProvider } from "@/providers/AppProvider";
import { PlayerProvider } from "@/providers/PlayerProvider";
import { LanguageProvider, useLanguage } from "@/providers/LanguageProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { useColors } from "@/utils/useColors";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";

void SplashScreen.preventAutoHideAsync().catch(() => {});

let hasHiddenSplashScreen = false;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function RootLayout() {
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    setIsAppReady(true);
  }, []);

  useEffect(() => {
    if (!isAppReady || hasHiddenSplashScreen) {
      return;
    }

    async function hideSplashScreen() {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        console.warn("SplashScreen hide ignored:", e);
      } finally {
        hasHiddenSplashScreen = true;
      }
    }

    void hideSplashScreen();
  }, [isAppReady]);

  function DesktopHeader() {
    const { t, language } = useLanguage();
    const colors = useColors();
    const pathname = usePathname() ?? "/";
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === "web" && width >= 1024;
    const navItems = [
      { id: "home", title: t("tabs.home"), route: "/", active: pathname === "/" || pathname === "/(tabs)" },
      { id: "articles", title: t("tabs.articles"), route: "/articles", active: pathname.startsWith("/articles") || pathname.startsWith("/(tabs)/articles") },
      { id: "radio", title: t("tabs.radio"), route: "/radio", active: pathname.startsWith("/radio") },
      { id: "media", title: t("tabs.media"), route: "/media", active: pathname.startsWith("/media") },
      { id: "profile", title: t("tabs.profile"), route: "/profile", active: pathname.startsWith("/profile") },
    ];

    if (!isDesktop) return null;

    return (
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerInner}>
          <Image source={logo} style={styles.brandLogo} resizeMode="contain" />

          <View style={styles.linkRow}>
            {navItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(item.route as any)}
                style={({ hovered }: any) => [
                  styles.navLink,
                  item.active && styles.navLinkActive,
                  hovered && !item.active && styles.navLinkHover,
                ]}
              >
                <Text style={[
                  styles.navText,
                  { color: item.active ? Palette.red : colors.text },
                  { fontWeight: item.active ? "700" : "500" },
                ]}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => router.push("/language")}
              style={({ hovered }: any) => [
                styles.languageBtn,
                { borderColor: colors.border, backgroundColor: hovered ? "#F5F0E8" : colors.card },
              ]}
            >
              <Text style={[styles.languageText, { color: colors.text }]}>
                {t(`languageNames.${language}`)}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/search")}
              style={({ hovered }: any) => [
                styles.iconBtn,
                { borderColor: colors.border, backgroundColor: hovered ? "#F5F0E8" : colors.card },
              ]}
            >
              <Search size={17} color={colors.text} strokeWidth={2} />
            </Pressable>

            <Pressable
              style={({ hovered }: any) => [
                styles.iconBtn,
                { borderColor: colors.border, backgroundColor: hovered ? "#F5F0E8" : colors.card },
              ]}
            >
              <Bell size={17} color={colors.text} strokeWidth={2} />
            </Pressable>

            <Pressable
              onPress={() => router.push("/profile")}
              style={({ hovered }: any) => [
                styles.avatarBtn,
                {
                  borderColor: hovered ? Palette.red : colors.border,
                  backgroundColor: hovered ? Palette.red : colors.card,
                },
              ]}
            >
              {({ hovered }: any) => (
                <User size={17} color={hovered ? Palette.white : colors.text} strokeWidth={2} />
              )}
            </Pressable>

            <Pressable
              onPress={() => router.push("/submit-article" as any)}
              style={({ hovered }: any) => [
                styles.submitArticleBtn,
                { opacity: hovered ? 0.86 : 1 },
              ]}
            >
              <Send size={14} color={Palette.white} strokeWidth={2.2} />
              <Text style={styles.submitArticleBtnText}>Tahririyatga maqola yuborish</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  function RootLayoutNav() {
    const { t } = useLanguage();
    const colors = useColors();

    return (
      <View style={styles.rootContainer}>
        <DesktopHeader />
        <Stack
          screenOptions={{
            headerBackTitle: t("common.back"),
            headerStyle: { backgroundColor: colors.background },
            headerTitleStyle: { fontFamily: Fonts.serif, fontWeight: "700", color: colors.text },
            headerTintColor: colors.tint,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="article/[id]" options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen
          name="player"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="video-player"
          options={{ presentation: "modal", headerShown: false, animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="reels"
          options={{
            presentation: "fullScreenModal",
            headerShown: false,
            animation: "slide_from_bottom",
            contentStyle: { backgroundColor: "#000" },
            statusBarStyle: "light",
          }}
        />
        <Stack.Screen name="search" options={{ title: t("common.search") }} />
        <Stack.Screen name="subscribe" options={{ presentation: "modal", title: t("profile.subscribe") }} />
        <Stack.Screen name="language" options={{ title: t("profile.language") }} />
        <Stack.Screen name="editorial" options={{ headerShown: false }} />
        <Stack.Screen name="authors" options={{ headerShown: false }} />
        <Stack.Screen name="archive" options={{ headerShown: false }} />
        <Stack.Screen name="issue/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="phone-verification" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="telegram-login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="submit-article" options={{ headerShown: false }} />
      </Stack>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <LanguageProvider>
            <ThemeProvider>
              <AppProvider>
                <PlayerProvider>
                  <StatusBar style="dark" />
                  <RootLayoutNav />
                </PlayerProvider>
              </AppProvider>
            </ThemeProvider>
          </LanguageProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    minHeight: "100%",
  },
  header: {
    ...Platform.select({ web: { position: "sticky" as any } }),
    top: 0,
    zIndex: 100,
    width: "100%",
    borderBottomWidth: 1,
    backgroundColor: Palette.white,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 0 rgba(0,0,0,0.06), 0 2px 12px rgba(0,0,0,0.04)",
      },
    }),
  },
  headerInner: {
    maxWidth: 1320,
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  brandLogo: {
    width: 200,
    height: 44,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  navLink: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    borderRadius: 6,
    ...Platform.select({
      web: {
        transitionProperty: "border-color, background-color",
        transitionDuration: "150ms",
      },
    }),
  },
  navLinkHover: {
    backgroundColor: "rgba(237,28,36,0.06)",
  },
  navLinkActive: {
    borderBottomColor: Palette.red,
  },
  navText: {
    fontSize: 14,
    letterSpacing: 0.1,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  languageBtn: {
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    ...Platform.select({
      web: { transitionProperty: "background-color", transitionDuration: "150ms" },
    }),
  },
  languageText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    ...Platform.select({
      web: { transitionProperty: "background-color", transitionDuration: "150ms", cursor: "pointer" },
    }),
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    ...Platform.select({
      web: { transitionProperty: "background-color, border-color", transitionDuration: "150ms", cursor: "pointer" },
    }),
  },
  submitArticleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: Palette.red,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginLeft: 4,
    ...Platform.select({
      web: { transitionProperty: "opacity", transitionDuration: "150ms", cursor: "pointer" },
    }),
  },
  submitArticleBtnText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
});
