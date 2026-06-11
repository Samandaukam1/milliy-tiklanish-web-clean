import { Image } from "expo-image";
import { router } from "expo-router";
import {
  BookMarked,
  Bell,
  ChevronRight,
  Crown,
  Download,
  Globe,
  Info,
  LogIn,
  LogOut,
  Moon,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Archive,
  Users,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { ArticleCard } from "@/components/ArticleCard";
import { useApp } from "@/providers/AppProvider";
import { useLanguage } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useColors } from "@/utils/useColors";
import { fetchArticlesByIds } from "@/lib/services";
import type { AppArticle } from "@/lib/types";

const APP_STORE_URL = "";
const PLAY_STORE_URL = "";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { saved, read, subscription, user, logout } = useApp();
  const { t, language } = useLanguage();
  const { theme, changeTheme } = useTheme();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const [notifs, setNotifs] = React.useState<boolean>(true);
  const [savedArticles, setSavedArticles] = useState<AppArticle[]>([]);
  const [continueArticles, setContinueArticles] = useState<AppArticle[]>([]);

  const showSoonAlert = () => {
    Alert.alert("Tez kunda", "Tez kunda ishga tushadi");
  };

  const handleCheckUpdate = () => {
    const storeUrl = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
    if (!storeUrl) {
      Alert.alert("Tez kunda", "Tez kunda");
      return;
    }

    Linking.openURL(storeUrl).catch(() => {
      Alert.alert("Tez kunda", "Tez kunda");
    });
  };

  useEffect(() => {
    if (saved.length > 0) {
      fetchArticlesByIds(saved, language as any).then(setSavedArticles).catch(() => {});
    } else {
      setSavedArticles([]);
    }
  }, [saved, language]);

  useEffect(() => {
    const readIds = read.slice(0, 5);
    if (readIds.length > 0) {
      fetchArticlesByIds(readIds, language as any).then(setContinueArticles).catch(() => {});
    } else {
      setContinueArticles([]);
    }
  }, [read, language]);

  const minutesListened = 42 + read.length * 3;
  const structuredFullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  const displayName = structuredFullName || user?.full_name || user?.name || user?.login || user?.email || user?.phone || "Foydalanuvchi";
  const secondaryIdentity = user?.login ? `@${user.login}` : user?.telegram_username ? `@${user.telegram_username}` : user?.email ?? user?.phone ?? "";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 180 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.pageShell, isDesktop && styles.pageShellDesktop]}>
        {/* Profile Hero Section */}
        {user ? (
          <View style={[styles.heroSection, isDesktop && styles.heroSectionDesktop]}>
            <View style={[styles.heroRow, isDesktop && styles.heroRowDesktop]}>
              <View style={styles.avatarWrap}>
                {user.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarInitial]}>
                    <Text style={styles.avatarInitialText}>
                      {displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                {subscription !== "free" && (
                  <View style={styles.crown}>
                    <Crown size={12} color={Palette.white} fill={Palette.white} />
                  </View>
                )}
              </View>
              <View style={[styles.heroMeta, isDesktop && styles.heroMetaDesktop]}>
                <Text style={[styles.name, { color: colors.text }]}>
                  {displayName}
                </Text>
                {!!secondaryIdentity && (
                  <Text style={[styles.handle, { color: colors.textSecondary }]}>{secondaryIdentity}</Text>
                )}
                <View
                  style={[
                    styles.tierBadge,
                    subscription === "free" && { backgroundColor: Palette.beige },
                    subscription === "pro" && { backgroundColor: Palette.black },
                  ]}
                >
                  <Sparkles size={12} color={Palette.white} />
                  <Text style={styles.tierText}>
                    {subscription === "free"
                      ? t("profile.freeSubscription")
                      : subscription === "premium"
                      ? t("profile.premium")
                      : "PRO"}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={logout}
                style={({ hovered }: any) => [
                  styles.logoutBtn,
                  hovered && styles.logoutBtnHover,
                ]}
              >
                <LogOut size={16} color={Palette.textSecondary} />
                <Text style={styles.logoutText}>Chiqish</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          /* ── Not logged in: show login CTA ── */
          <View style={[styles.loginSection, isDesktop && styles.loginSectionDesktop]}>
            <View style={styles.loginIconWrap}>
              <LogIn size={28} color={Palette.white} />
            </View>
            <Text style={[styles.loginTitle, { color: colors.text }]}>Shaxsiy kabinet</Text>
            <Text style={[styles.loginSub, { color: colors.textSecondary }]}>
              Maqolalarni saqlash, obuna va boshqa imkoniyatlar uchun tizimga kiring
            </Text>
            <Pressable
              onPress={() => router.push("/login")}
              style={({ pressed, hovered }: any) => [
                styles.loginBtn,
                (pressed || hovered) && styles.loginBtnPressed,
              ]}
            >
              <Text style={styles.loginBtnText}>{"Kirish / Ro'yxatdan o'tish"}</Text>
            </Pressable>
          </View>
        )}

        {/* Stats and Premium Section */}
        {isDesktop ? (
          <View style={styles.statsPremiumRow}>
            <View style={[styles.statsRowDesktop, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Stat value={read.length} label={t("profile.read")} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <Stat value={minutesListened} label={t("profile.listened")} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <Stat value={saved.length} label={t("profile.saved")} />
            </View>
            {subscription === "free" && (
              <Pressable onPress={() => router.push("/subscribe")} style={styles.subCardDesktop}>
                <View style={styles.subLeft}>
                  <Text style={styles.subKicker}>{t("profile.upgradeTitle")}</Text>
                  <Text style={styles.subTitle}>{t("profile.upgradeSubtitle")}</Text>
                  <Text style={styles.subDesc}>
                    {t("profile.upgradeDesc")}
                  </Text>
                </View>
                <View style={styles.subBtn}>
                  <Text style={styles.subBtnText}>{t("profile.subscribe")}</Text>
                </View>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Stat value={read.length} label={t("profile.read")} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <Stat value={minutesListened} label={t("profile.listened")} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <Stat value={saved.length} label={t("profile.saved")} />
            </View>
            {subscription === "free" && (
              <Pressable onPress={() => router.push("/subscribe")} style={styles.subCard}>
                <View style={styles.subLeft}>
                  <Text style={styles.subKicker}>{t("profile.upgradeTitle")}</Text>
                  <Text style={styles.subTitle}>{t("profile.upgradeSubtitle")}</Text>
                  <Text style={styles.subDesc}>
                    {t("profile.upgradeDesc")}
                  </Text>
                </View>
                <View style={styles.subBtn}>
                  <Text style={styles.subBtnText}>{t("profile.subscribe")}</Text>
                </View>
              </Pressable>
            )}
          </>
        )}

        {/* Profile Content Sections */}
        <Section title="Kutubxona" kicker="Shaxsiy" desktop={isDesktop}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ paddingHorizontal: 20 }, isDesktop && { paddingHorizontal: 0 }]}>
            {savedArticles.length === 0 ? (
              <View style={[styles.emptyLibrary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <BookMarked size={22} color={Palette.beige} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{"Saqlangan maqolalar bu yerda ko'rinadi"}</Text>
              </View>
            ) : (
              savedArticles.map((a) => <ArticleCard key={a.id} article={a} variant="compact" />)
            )}
          </ScrollView>

          {continueArticles.length > 0 && (
            <View style={[styles.continueSection, isDesktop && styles.continueSectionDesktop]}>
              <Text style={[styles.subSectionTitle, { color: colors.textSecondary }]}>Davom ettirish</Text>
              <View style={[styles.continueGrid, isDesktop && styles.continueGridDesktop]}>
                {continueArticles.map((a) => (
                  <ArticleCard key={a.id} article={a} variant="list" containerStyle={isDesktop ? styles.continueCardDesktop : undefined} />
                ))}
              </View>
            </View>
          )}
        </Section>

        <Section title="Yangilash" kicker="Muhim" desktop={isDesktop}>
          <View
            style={[
              styles.card,
              styles.updateCard,
              isDesktop && styles.cardDesktop,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.updateHeader}>
              <View style={[styles.updateIconWrap, { backgroundColor: colors.surface }]}>
                <Download size={18} color={colors.iconColor} />
              </View>
              <View style={styles.updateCopy}>
                <Text style={[styles.updateTitle, { color: colors.text }]}>Ilovani yangilash</Text>
                <Text style={[styles.updateText, { color: colors.textSecondary }]}>
                  {"Ilovani App Store yoki Google Play orqali yangilang. Yoki App Store / Google Play'da yangilanish borligini tekshiring."}
                </Text>
              </View>
            </View>

            <Pressable onPress={handleCheckUpdate} style={({ pressed }: any) => [styles.updateButton, pressed && styles.loginBtnPressed]}>
              <Text style={styles.updateButtonText}>Yangilanishni tekshirish</Text>
            </Pressable>
          </View>
        </Section>

        <Section title={t("profile.settings")} kicker="Profil" desktop={isDesktop}>
          {isDesktop ? (
            <View style={styles.settingsContainerDesktop}>
              <View style={styles.settingsGridDesktop}>
                <SettingCard
                  icon={<Globe size={18} color={colors.iconColor} />}
                  label={t("profile.language")}
                  value={t(`languageNames.${language}`)}
                  onPress={() => router.push("/language")}
                />
                <SettingCard
                  icon={<Smartphone size={18} color={colors.iconColor} />}
                  label="Telefon raqamini almashtirish"
                  value={user?.phone ?? undefined}
                  onPress={user ? showSoonAlert : undefined}
                />
                <SettingCard
                  icon={<Moon size={18} color={colors.iconColor} />}
                  label={t("profile.theme")}
                  right={
                    <Switch
                      value={theme === "dark"}
                      onValueChange={(value) => changeTheme(value ? "dark" : "light")}
                      trackColor={{ true: Palette.red, false: Palette.beigeLight }}
                      thumbColor={Palette.white}
                    />
                  }
                />
                <SettingCard
                  icon={<Bell size={18} color={colors.iconColor} />}
                  label={t("profile.notifications")}
                  right={
                    <Switch
                      value={notifs}
                      onValueChange={setNotifs}
                      trackColor={{ true: Palette.red, false: Palette.beigeLight }}
                      thumbColor={Palette.white}
                    />
                  }
                />
                <SettingCard
                  icon={<Download size={18} color={colors.iconColor} />}
                  label={t("profile.downloads")}
                  value="0 ta fayl"
                  onPress={() => {}}
                />
                <SettingCard
                  icon={<ShieldCheck size={18} color={colors.iconColor} />}
                  label={t("profile.privacy")}
                  onPress={() => {}}
                />
                <SettingCard
                  icon={<Share2 size={18} color={colors.iconColor} />}
                  label={t("profile.share")}
                  onPress={() => {}}
                />
                <SettingCard
                  icon={<Info size={18} color={colors.iconColor} />}
                  label={t("profile.about")}
                  value="v1.0.0"
                  onPress={() => {}}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row
                icon={<Globe size={18} color={colors.iconColor} />}
                label={t("profile.language")}
                value={t(`languageNames.${language}`)}
                onPress={() => router.push("/language")}
              />
              <Row
                icon={<Smartphone size={18} color={colors.iconColor} />}
                label="Telefon raqamini almashtirish"
                value={user?.phone ?? undefined}
                onPress={user ? () => router.push("/phone-verification?source=profile") : undefined}
              />
              <Row
                icon={<Moon size={18} color={colors.iconColor} />}
                label={t("profile.theme")}
                right={
                  <Switch
                    value={theme === "dark"}
                    onValueChange={(value) => changeTheme(value ? "dark" : "light")}
                    trackColor={{ true: Palette.red, false: Palette.beigeLight }}
                    thumbColor={Palette.white}
                  />
                }
              />
              <Row
                icon={<Bell size={18} color={colors.iconColor} />}
                label={t("profile.notifications")}
                right={
                  <Switch
                    value={notifs}
                    onValueChange={setNotifs}
                    trackColor={{ true: Palette.red, false: Palette.beigeLight }}
                    thumbColor={Palette.white}
                  />
                }
              />
              <Row
                icon={<Download size={18} color={colors.iconColor} />}
                label={t("profile.downloads")}
                value="0 ta fayl"
                onPress={() => {}}
              />
              <Row
                icon={<ShieldCheck size={18} color={colors.iconColor} />}
                label={t("profile.privacy")}
                onPress={() => {}}
              />
              <Row
                icon={<Share2 size={18} color={colors.iconColor} />}
                label={t("profile.share")}
                onPress={() => {}}
              />
              <Row
                icon={<Info size={18} color={colors.iconColor} />}
                label={t("profile.about")}
                value="v1.0.0"
                onPress={() => {}}
                last
              />
            </View>
          )}
        </Section>

        <Section title="Gazeta" kicker="Raqamli nashr" desktop={isDesktop}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Row
              icon={<Archive size={18} color={colors.iconColor} />}
              label="Maqolalar arxivi"
              onPress={() => router.push("/archive")}
            />
            <Row
              icon={<Users size={18} color={colors.iconColor} />}
              label="Eng ko'p o'qilgan mualliflar"
              onPress={() => router.push("/authors")}
            />
            <Row
              icon={<Info size={18} color={colors.iconColor} />}
              label="Tahririyat haqida"
              onPress={() => router.push("/editorial")}
              last
            />
          </View>
        </Section>

        <Text style={[styles.footer, isDesktop && styles.footerDesktop]}>© 2026 Milliy Tiklanish gazetasi</Text>
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function Section({ title, kicker, children, desktop }: { title: string; kicker: string; children: React.ReactNode; desktop?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.section, desktop && styles.sectionDesktop]}>
      <View style={[styles.sectionHeader, desktop && styles.sectionHeaderDesktop]}>
        <Text style={styles.sKicker}>{kicker.toUpperCase()}</Text>
        <Text style={[styles.sTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.sRule} />
      </View>
      {children}
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  right,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && { ...styles.rowBorder, borderBottomColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.surface }]}>{icon}</View>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {right ? right : value ? <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text> : null}
      {onPress && !right && <ChevronRight size={16} color={colors.textMuted} />}
    </Pressable>
  );
}

function SettingCard({
  icon,
  label,
  value,
  right,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const colors = useColors();
  const content = (
    <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.settingIcon, { backgroundColor: colors.surface }]}>{icon}</View>
      <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
      {right ? right : value ? <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text> : null}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}

const styles = StyleSheet.create({
  // ── Avatar ─────────────────────────────────────────────────────────────────
  avatarWrap: { position: "relative" },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: Palette.white,
  },
  avatarInitial: {
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialText: {
    color: Palette.white,
    fontSize: 36,
    fontWeight: "800",
    fontFamily: Fonts.serif,
  },
  crown: {
    position: "absolute",
    right: -2,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Palette.cream,
  },
  // ── Logout button ──────────────────────────────────────────────────────────
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Platform.select({ web: { cursor: "pointer", transitionProperty: "opacity", transitionDuration: "150ms" } as any }),
  },
  logoutBtnHover: { opacity: 0.7 },
  logoutText: { fontSize: 13, color: Palette.textSecondary, fontWeight: "600" },
  // ── Login CTA ──────────────────────────────────────────────────────────────
  loginSection: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: "center",
  },
  loginSectionDesktop: {
    paddingHorizontal: 0,
    paddingVertical: 48,
    maxWidth: 480,
    alignSelf: "center",
  },
  loginIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    ...Platform.select({ web: { boxShadow: "0 4px 20px rgba(237,28,36,0.25)" } as any }),
  },
  loginTitle: {
    fontFamily: Fonts.serif,
    fontSize: 24,
    fontWeight: "700",
    color: Palette.black,
    marginBottom: 10,
    textAlign: "center",
  },
  loginSub: {
    fontSize: 14,
    color: Palette.textSecondary,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  loginBtn: {
    backgroundColor: Palette.red,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: "stretch",
    alignItems: "center",
    ...Platform.select({ web: { cursor: "pointer", transitionProperty: "opacity", transitionDuration: "150ms" } as any }),
  },
  loginBtnPressed: { opacity: 0.8 },
  loginBtnText: { color: Palette.white, fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },
  pageShell: { width: "100%" },
  pageShellDesktop: { width: "100%", maxWidth: 1200, alignSelf: "center", paddingHorizontal: 24 },
  heroSection: { paddingHorizontal: 20, paddingTop: 8 },
  heroSectionDesktop: { paddingHorizontal: 0, paddingTop: 24, marginBottom: 32 },
  heroRow: { alignItems: "center" },
  heroRowDesktop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroMeta: { alignItems: "center", marginTop: 16 },
  heroMetaDesktop: { alignItems: "flex-start", marginTop: 0, flex: 1, marginLeft: 24 },
  heroCTA: { backgroundColor: Palette.red, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  heroCTAText: { color: Palette.white, fontSize: 14, fontWeight: "800" },
  statsPremiumRow: { flexDirection: "row", gap: 24, marginBottom: 40 },
  statsRowDesktop: {
    flex: 1,
    backgroundColor: Palette.white,
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECE6D8",
    flexDirection: "row",
    justifyContent: "space-around",
  },
  subCardDesktop: {
    flex: 1,
    backgroundColor: Palette.black,
    padding: 24,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  name: { fontSize: 22, fontFamily: Fonts.serif, fontWeight: "800", color: Palette.black, marginTop: 10 },
  handle: { color: Palette.textSecondary, fontSize: 13, marginTop: 2 },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Palette.red,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    marginTop: 10,
  },
  tierText: { color: Palette.white, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Palette.white,
    marginHorizontal: 20,
    marginTop: 22,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  statValue: { fontSize: 22, fontFamily: Fonts.serif, fontWeight: "800", color: Palette.black },
  statLabel: { fontSize: 11, color: Palette.textSecondary, marginTop: 2, letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: "#ECE6D8" },
  subCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Palette.black,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 18,
    borderRadius: 16,
  },
  subLeft: { flex: 1 },
  subKicker: { color: Palette.red, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  subTitle: { color: Palette.white, fontSize: 20, fontFamily: Fonts.serif, fontWeight: "700", marginTop: 4 },
  subDesc: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 6, lineHeight: 17 },
  subBtn: { backgroundColor: Palette.red, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  subBtnText: { color: Palette.white, fontSize: 13, fontWeight: "800" },
  section: { marginTop: 30 },
  sectionDesktop: { marginTop: 40 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
  sectionHeaderDesktop: { paddingHorizontal: 0, maxWidth: 1180, alignSelf: "center", marginBottom: 18 },
  sKicker: { color: Palette.beige, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  sTitle: { fontSize: 22, fontFamily: Fonts.serif, fontWeight: "800", color: Palette.black, marginTop: 4 },
  sRule: { height: 2, backgroundColor: Palette.red, width: 28, marginTop: 6 },
  subSectionTitle: { fontSize: 14, color: Palette.textSecondary, fontWeight: "700", letterSpacing: 0.5 },
  emptyLibrary: {
    width: 240,
    height: 140,
    backgroundColor: Palette.white,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  emptyText: { color: Palette.textSecondary, fontSize: 13, textAlign: "center" },
  updateCard: {
    padding: 18,
    gap: 18,
  },
  updateHeader: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  updateIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  updateCopy: {
    flex: 1,
    gap: 6,
  },
  updateTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  updateText: {
    fontSize: 13,
    lineHeight: 20,
  },
  updateButton: {
    alignSelf: "flex-start",
    backgroundColor: Palette.red,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },
  updateButtonText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "700",
  },
  continueSection: { paddingHorizontal: 20, marginTop: 18 },
  continueSectionDesktop: { paddingHorizontal: 0, marginTop: 24, maxWidth: 820, alignSelf: "center" },
  continueGrid: { gap: 18, marginTop: 10 },
  continueGridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 10 },
  continueCardDesktop: { flexBasis: '48%', flexGrow: 1, minWidth: 300 },
  card: {
    backgroundColor: Palette.white,
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECE6D8",
    overflow: "hidden",
  },
  cardDesktop: {
    marginHorizontal: 0,
    maxWidth: 820,
    alignSelf: "center",
  },
  settingsContainerDesktop: {
    maxWidth: 820,
    alignSelf: "center",
  },
  settingsGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'flex-start',
  },
  settingCard: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECE6D8",
    padding: 20,
    flexBasis: '48%',
    minWidth: 250,
    minHeight: 120,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Palette.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  settingLabel: {
    textAlign: 'center',
    color: Palette.black,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  settingValue: {
    textAlign: 'center',
    color: Palette.textSecondary,
    fontSize: 13,
  },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#ECE6D8" },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Palette.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, color: Palette.black, fontSize: 14, fontWeight: "600" },
  rowValue: { color: Palette.textSecondary, fontSize: 13 },
  footer: {
    textAlign: "center",
    marginTop: 30,
    color: Palette.beige,
    fontSize: 11,
    letterSpacing: 1,
  },
  footerDesktop: { marginTop: 50 },
});
