import { router } from "expo-router";
import {
  Instagram,
  Facebook,
  Info,
  Send,
  Youtube,
  Twitter,
  MessageCircle,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { fetchSocialSettings } from "@/lib/services";
import type { SocialSettings } from "@/lib/types";
import { useColors } from "@/utils/useColors";
import { useLanguage } from "@/providers/LanguageProvider";

// ─── TikTok SVG icon (not in lucide-react-native) ────────────────────────────

function TikTokIcon({ size = 22, color = "#fff" }: { size?: number; color?: string }) {
  // Minimal TikTok "note" path rendered via Text as fallback on native,
  // or a small SVG on web where it renders correctly.
  if (Platform.OS === "web") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={color}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.17 8.17 0 004.78 1.52V6.82a4.85 4.85 0 01-1.01-.13z" />
      </svg>
    );
  }
  // On native, fall back to a simple "♪" text character sized to match
  return (
    <Text style={{ fontSize: size * 0.85, color, lineHeight: size, textAlign: "center" }}>
      ♪
    </Text>
  );
}

// ─── Social network config ────────────────────────────────────────────────────

type SocialKey =
  | "telegram"
  | "instagram"
  | "youtube"
  | "facebook"
  | "tiktok"
  | "twitter";

type SocialConfig = {
  key: SocialKey;
  enabledField: keyof SocialSettings;
  urlField: keyof SocialSettings;
  label: string;
  bg: string;
  shadow: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
};

const SOCIAL_CONFIGS: SocialConfig[] = [
  {
    key: "telegram",
    enabledField: "telegram_enabled",
    urlField: "telegram_url",
    label: "Telegram",
    bg: "#229ED9",
    shadow: "rgba(34,158,217,0.28)",
    Icon: MessageCircle,
  },
  {
    key: "instagram",
    enabledField: "instagram_enabled",
    urlField: "instagram_url",
    label: "Instagram",
    bg: "#E1306C",
    shadow: "rgba(225,48,108,0.28)",
    Icon: Instagram,
  },
  {
    key: "youtube",
    enabledField: "youtube_enabled",
    urlField: "youtube_url",
    label: "YouTube",
    bg: "#FF0000",
    shadow: "rgba(255,0,0,0.28)",
    Icon: Youtube,
  },
  {
    key: "facebook",
    enabledField: "facebook_enabled",
    urlField: "facebook_url",
    label: "Facebook",
    bg: "#1877F2",
    shadow: "rgba(24,119,242,0.28)",
    Icon: Facebook,
  },
  {
    key: "tiktok",
    enabledField: "tiktok_enabled",
    urlField: "tiktok_url",
    label: "TikTok",
    bg: "#010101",
    shadow: "rgba(0,0,0,0.32)",
    Icon: TikTokIcon,
  },
  {
    key: "twitter",
    enabledField: "twitter_enabled",
    urlField: "twitter_url",
    label: "X / Twitter",
    bg: "#14171A",
    shadow: "rgba(0,0,0,0.28)",
    Icon: Twitter,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SocialEditorialBlock() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const colors = useColors();
  const { language } = useLanguage();

  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSocialSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingSettings(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openLink = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    Linking.openURL(trimmed).catch(() => {});
  };

  // Resolve the section title based on current language
  const sectionTitle = (() => {
    if (!settings) return "BIZ BILAN BO'LING";
    const map: Record<string, keyof SocialSettings> = {
      uz: "title_uz",
      uz_cy: "title_uz_cy",
      ru: "title_ru",
      en: "title_en",
    };
    const field = map[language] ?? "title_uz";
    const val = settings[field];
    return (typeof val === "string" && val.trim()) ? val.trim().toUpperCase() : "BIZ BILAN BO'LING";
  })();

  // Build the list of enabled socials with valid URLs
  const enabledSocials = SOCIAL_CONFIGS.filter(({ enabledField, urlField }) => {
    if (!settings) return false;
    const enabled = settings[enabledField];
    const url = settings[urlField];
    return enabled === true && typeof url === "string" && url.trim().length > 0;
  });

  return (
    <View style={[styles.wrap, isDesktop && styles.wrapDesktop]}>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* ── Social row ────────────────────────────────────────────────── */}
      <View style={styles.socialSection}>
        <Text style={styles.sectionLabel}>{sectionTitle}</Text>

        {loadingSettings ? (
          <ActivityIndicator color={Palette.red} size="small" style={{ alignSelf: "flex-start", marginTop: 4 }} />
        ) : enabledSocials.length === 0 ? null : (
          <View style={[styles.socialRow, isDesktop && styles.socialRowDesktop]}>
            {enabledSocials.map(({ key, label, Icon, bg, shadow, urlField }) => {
              const url = settings ? String(settings[urlField] ?? "") : "";
              return (
                <Pressable
                  key={key}
                  onPress={() => openLink(url)}
                  accessibilityLabel={label}
                  accessibilityRole="link"
                  style={({ hovered, pressed }: any) => [
                    styles.socialCard,
                    { backgroundColor: bg },
                    Platform.OS === "web" && {
                      boxShadow: hovered
                        ? `0 8px 24px ${shadow}`
                        : `0 4px 12px ${shadow}`,
                      transform: [{ scale: hovered ? 1.04 : 1 }],
                    },
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <View
                    style={[
                      styles.socialIconWrap,
                      { backgroundColor: "rgba(255,255,255,0.18)" },
                    ]}
                  >
                    <Icon size={22} color="#fff" />
                  </View>
                  <Text style={styles.socialCardText}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Editorial buttons ─────────────────────────────────────────── */}
      <View style={styles.editorialSection}>
        {isDesktop && (
          <View style={styles.editorialHeading}>
            <Text style={[styles.editorialTitle, { color: colors.text }]}>
              Milliy Tiklanish Gazetasi Tahririyati
            </Text>
            <Text style={[styles.editorialDesc, { color: colors.textSecondary }]}>
              Mustaqil jurnalistika · Professional tahrir jamoasi
            </Text>
          </View>
        )}

        <View style={[styles.editorialBtnRow, isDesktop && styles.editorialBtnRowDesktop]}>
          {/* About editorial */}
          <Pressable
            onPress={() => router.push("/editorial")}
            style={({ hovered, pressed }: any) => [
              styles.editorialCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              Platform.OS === "web" &&
                hovered && {
                  borderColor: Palette.black,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                },
              pressed && { opacity: 0.85 },
            ]}
          >
            <View
              style={[
                styles.editorialCardIconWrap,
                { backgroundColor: Palette.black },
              ]}
            >
              <Info size={20} color={Palette.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.editorialCardTitle, { color: colors.text }]}>
                Tahririyat haqida
              </Text>
              <Text
                style={[styles.editorialCardSub, { color: colors.textSecondary }]}
              >
                Jamoamiz va maqsadlarimiz
              </Text>
            </View>
          </Pressable>

          {/* Submit article */}
          <Pressable
            onPress={() => router.push("/submit-article" as any)}
            style={({ hovered, pressed }: any) => [
              styles.editorialCard,
              styles.editorialCardRed,
              Platform.OS === "web" &&
                hovered && {
                  boxShadow: "0 6px 24px rgba(237,28,36,0.28)",
                  transform: [{ scale: 1.02 }],
                },
              pressed && { opacity: 0.88 },
            ]}
          >
            <View
              style={[
                styles.editorialCardIconWrap,
                { backgroundColor: "rgba(255,255,255,0.18)" },
              ]}
            >
              <Send size={20} color={Palette.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.editorialCardTitle, { color: Palette.white }]}
              >
                Tahririyatga maqola yuborish
              </Text>
              <Text
                style={[
                  styles.editorialCardSub,
                  { color: "rgba(255,255,255,0.72)" },
                ]}
              >
                {"O'z maqolangizni yuboring"}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 32,
    paddingTop: 8,
    gap: 28,
  },
  wrapDesktop: {
    paddingHorizontal: 0,
  },
  divider: {
    height: 1,
  },

  // ── Social ──────────────────────────────────────────────────────────────
  socialSection: { gap: 14 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: Palette.beige,
    textTransform: "uppercase",
  },
  socialRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  socialRowDesktop: {
    flexWrap: "nowrap",
  },
  socialCard: {
    flex: 1,
    minWidth: 100,
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 20,
    ...Platform.select({
      web: {
        transitionProperty: "box-shadow, transform",
        transitionDuration: "180ms",
        cursor: "pointer",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
        elevation: 5,
      },
    }),
  },
  socialIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  socialCardText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // ── Editorial ───────────────────────────────────────────────────────────
  editorialSection: { gap: 14 },
  editorialHeading: { gap: 4 },
  editorialTitle: {
    fontSize: 16,
    fontFamily: Fonts.serif,
    fontWeight: "800",
  },
  editorialDesc: {
    fontSize: 13,
    lineHeight: 20,
  },
  editorialBtnRow: {
    gap: 12,
    flexDirection: "column",
  },
  editorialBtnRowDesktop: {
    flexDirection: "row",
  },
  editorialCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
    ...Platform.select({
      web: {
        transitionProperty: "box-shadow, transform, border-color",
        transitionDuration: "180ms",
        cursor: "pointer",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
      },
    }),
  },
  editorialCardRed: {
    backgroundColor: Palette.red,
    borderColor: Palette.red,
  },
  editorialCardIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  editorialCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
  editorialCardSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
});


