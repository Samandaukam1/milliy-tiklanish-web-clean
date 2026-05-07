import { router } from "expo-router";
import { Instagram, MessageCircle, Facebook, Info, Send } from "lucide-react-native";
import React from "react";
import {
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
import { useColors } from "@/utils/useColors";

const SOCIAL_LINKS = {
  instagram: "https://instagram.com/milliy_tiklanish",
  telegram: "https://t.me/milliy_tiklanish",
  facebook: "https://facebook.com/milliy.tiklanish",
};

const SOCIALS = [
  {
    key: "instagram",
    label: "Instagram",
    Icon: Instagram,
    bg: "#E1306C",
    shadow: "rgba(225,48,108,0.28)",
  },
  {
    key: "telegram",
    label: "Telegram",
    Icon: MessageCircle,
    bg: "#229ED9",
    shadow: "rgba(34,158,217,0.28)",
  },
  {
    key: "facebook",
    label: "Facebook",
    Icon: Facebook,
    bg: "#1877F2",
    shadow: "rgba(24,119,242,0.28)",
  },
] as const;

export function SocialEditorialBlock() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const colors = useColors();

  const openLink = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <View style={[styles.wrap, isDesktop && styles.wrapDesktop]}>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* ── Social row ────────────────────────────────────────────────── */}
      <View style={styles.socialSection}>
        <Text style={styles.sectionLabel}>BIZ BILAN BO'LING</Text>
        <View style={[styles.socialRow, isDesktop && styles.socialRowDesktop]}>
          {SOCIALS.map(({ key, label, Icon, bg, shadow }) => (
            <Pressable
              key={key}
              onPress={() => openLink(SOCIAL_LINKS[key])}
              accessibilityLabel={label}
              style={({ hovered, pressed }: any) => [
                styles.socialCard,
                { backgroundColor: bg },
                Platform.OS === "web" && {
                  boxShadow: hovered ? `0 8px 24px ${shadow}` : `0 4px 12px ${shadow}`,
                  transform: [{ scale: hovered ? 1.04 : 1 }],
                },
                pressed && { opacity: 0.88 },
              ]}
            >
              <View style={[styles.socialIconWrap, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
                <Icon size={22} color="#fff" />
              </View>
              <Text style={styles.socialCardText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Editorial buttons ─────────────────────────────────────────── */}
      <View style={styles.editorialSection}>
        {isDesktop && (
          <View style={styles.editorialHeading}>
            <Text style={[styles.editorialTitle, { color: colors.text }]}>Milliy Tiklanish Tahririyati</Text>
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
              Platform.OS === "web" && hovered && {
                borderColor: Palette.black,
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={[styles.editorialCardIconWrap, { backgroundColor: Palette.black }]}>
              <Info size={20} color={Palette.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.editorialCardTitle, { color: colors.text }]}>Tahririyat haqida</Text>
              <Text style={[styles.editorialCardSub, { color: colors.textSecondary }]}>Jamoamiz va maqsadlarimiz</Text>
            </View>
          </Pressable>

          {/* Submit article */}
          <Pressable
            onPress={() => router.push("/submit-article" as any)}
            style={({ hovered, pressed }: any) => [
              styles.editorialCard,
              styles.editorialCardRed,
              Platform.OS === "web" && hovered && {
                boxShadow: "0 6px 24px rgba(237,28,36,0.28)",
                transform: [{ scale: 1.02 }],
              },
              pressed && { opacity: 0.88 },
            ]}
          >
            <View style={[styles.editorialCardIconWrap, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Send size={20} color={Palette.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.editorialCardTitle, { color: Palette.white }]}>Tahririyatga maqola yuborish</Text>
              <Text style={[styles.editorialCardSub, { color: "rgba(255,255,255,0.72)" }]}>{"O'z maqolangizni yuboring"}</Text>
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

