import { router, Stack } from "expo-router";
import { ArrowLeft, Users, Edit3, Award, Globe, MapPin, Building2 } from "lucide-react-native";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { useColors } from "@/utils/useColors";

const ORG_NAME = '"MILLIY TIKLANISH GAZETASI TAHRIRIYATI" MAS\'ULIYATI CHEKLANGAN JAMIYAT';
const ORG_NAME_SHORT = "Milliy Tiklanish Gazetasi Tahririyati";
const ADDRESS = "Toshkent shahri, Yunusobod tumani,\nА.ТЕМУР 1-tor ko'chasi, 2-uy";

const TEAM: { role: string; name: string }[] = [
  { name: "Mirodil Abdurahmonov",  role: "Bosh muharrir" },
  { name: "Mamurjon Yo'ldoshev",   role: "Bosh muharrir o'rinbosari" },
  { name: "Mahbuba Karimova",      role: "Bosh muharrir o'rinbosari" },
  { name: "Axmedova Zarina",       role: "Muxbir" },
  { name: "Maftuna Muhiddinova",   role: "Muxbir" },
  { name: "Viloyat Shodiyeva",     role: "Muxbir" },
  { name: "Abdug'affor Omonboyev", role: "Muxbir" },
  { name: "Ravshan Mahmudov",      role: "Muxbir" },
];

const STATS = [
  { icon: <Users size={20} color={Palette.red} />, value: "25+", label: "Jurnalistlar" },
  { icon: <Edit3 size={20} color={Palette.red} />, value: "1000+", label: "Maqolalar" },
  { icon: <Award size={20} color={Palette.red} />, value: "2015", label: "Tashkil etilgan" },
  { icon: <Globe size={20} color={Palette.red} />, value: "4", label: "Til" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Role weight — used to assign a distinct accent color per tier
function roleColor(role: string): string {
  if (role === "Bosh muharrir") return Palette.red;
  if (role.includes("o'rinbosari")) return "#5C6BC0";
  return "#546E7A";
}

export default function EditorialPage() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  return (
    <View style={[styles.page, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.iconColor} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Tahririyat haqida</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>MILLIY TIKLANISH GAZETASI</Text>
          <Text style={styles.heroTitle}>Mustaqil jurnalistika va haqiqat uchun</Text>
          <Text style={styles.heroDesc}>
            Milliy Tiklanish gazetasi 2015-yildan beri O'zbekistondagi mustaqil
            jurnalistika maydonida faoliyat yuritib kelmoqda. Biz siyosat, iqtisod,
            madaniyat va ijtimoiy hayotning barcha jabhalarini xolisona yoritamiz.
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {STATS.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {s.icon}
              <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Mission */}
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>MISSIYA</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Nima uchun bizni o'qing?</Text>
          <View style={styles.missionList}>
            {[
              "Har kuni yangi tahliliy maqolalar",
              "4 tilda: O'zbek, Rus, Ingliz, Kirill",
              "Premium va bepul kontent",
              "Audio versiyalar",
              "Raqamli arxiv",
            ].map((item) => (
              <View key={item} style={styles.missionItem}>
                <View style={styles.missionDot} />
                <Text style={[styles.missionText, { color: colors.text }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Team */}
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>JAMOA</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tahririyat a'zolari</Text>
          <View style={styles.teamList}>
            {TEAM.map((m) => {
              const initials = getInitials(m.name);
              const accent = roleColor(m.role);
              return (
                <View
                  key={m.name}
                  style={[styles.teamCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={[styles.teamAvatar, { backgroundColor: accent }]}>
                    <Text style={styles.teamInitials}>{initials}</Text>
                  </View>
                  <View style={styles.teamInfo}>
                    <Text style={[styles.teamRole, { color: accent }]}>{m.role.toUpperCase()}</Text>
                    <Text style={[styles.teamName, { color: colors.text }]}>{m.name}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Company & Address */}
        <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.contactTitle, { color: colors.text }]}>Tashkilot ma'lumotlari</Text>

          <View style={styles.contactRow}>
            <Building2 size={16} color={Palette.red} style={styles.contactIcon} />
            <Text style={[styles.contactText, { color: colors.textSecondary }]}>{ORG_NAME}</Text>
          </View>

          <View style={styles.contactRow}>
            <MapPin size={16} color={Palette.red} style={styles.contactIcon} />
            <Text style={[styles.contactText, { color: colors.textSecondary }]}>{ADDRESS}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Palette.cream },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ECE6D8",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  pageTitle: {
    fontSize: 16,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
  },
  scrollContent: { paddingBottom: 60 },

  // Hero
  hero: {
    backgroundColor: Palette.black,
    padding: 28,
    gap: 12,
  },
  heroKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: Palette.red,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.white,
    lineHeight: 34,
  },
  heroDesc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 22,
  },

  // Stats
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: Palette.white,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  statValue: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
  },
  statLabel: {
    fontSize: 11,
    color: Palette.textSecondary,
    fontWeight: "600",
  },

  // Section
  section: { paddingHorizontal: 20, paddingTop: 28, gap: 12 },
  sectionKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: Palette.red,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
  },

  // Mission
  missionList: { gap: 10 },
  missionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  missionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.red,
    flexShrink: 0,
  },
  missionText: {
    fontSize: 15,
    color: Palette.black,
    lineHeight: 22,
  },

  // Team
  teamList: { gap: 12 },
  teamCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  teamAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  teamInitials: {
    color: Palette.white,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  teamInfo: { flex: 1, gap: 3 },
  teamRole: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Palette.red,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.black,
    lineHeight: 22,
  },

  // Contact / Company
  contactCard: {
    margin: 20,
    marginTop: 28,
    backgroundColor: Palette.creamDeep,
    borderRadius: 18,
    padding: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  contactTitle: {
    fontSize: 16,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    marginBottom: 2,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  contactIcon: {
    marginTop: 2,
    flexShrink: 0,
  } as any,
  contactText: {
    flex: 1,
    fontSize: 14,
    color: Palette.textSecondary,
    lineHeight: 22,
  },
});
