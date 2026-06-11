import { router, Stack } from "expo-router";
import { ArrowLeft, Users, Edit3, Award, Globe } from "lucide-react-native";
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

const TEAM = [
  {
    role: "Bosh muharrir",
    name: "Dilshod Yusupov",
    desc: "20 yildan ortiq jurnalistika tajribasi. Siyosat va iqtisod mutaxassisi.",
  },
  {
    role: "Mas'ul kotib",
    name: "Zilola Rahimova",
    desc: "Tahrir jarayonlarini boshqaradi. Nashr sifatini ta'minlaydi.",
  },
  {
    role: "Ijtimoiy muharrir",
    name: "Bobur Mirzaev",
    desc: "Ijtimoiy va madaniy mavzular bo'yicha mutaxassis jurnalist.",
  },
  {
    role: "Iqtisod muharriri",
    name: "Nasiba Xoliqova",
    desc: "Iqtisodiy tahlil va biznes jurnalistikasining yetakchi mutaxassisi.",
  },
  {
    role: "Xalqaro muharrir",
    name: "Jasur Toshmatov",
    desc: "Xalqaro munosabatlar va tashqi siyosat bo'yicha tahlilchi.",
  },
];

const STATS = [
  { icon: <Users size={20} color={Palette.red} />, value: "25+", label: "Jurnalistlar" },
  { icon: <Edit3 size={20} color={Palette.red} />, value: "1000+", label: "Maqolalar" },
  { icon: <Award size={20} color={Palette.red} />, value: "2015", label: "Tashkil etilgan" },
  { icon: <Globe size={20} color={Palette.red} />, value: "4", label: "Til" },
];

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
            {TEAM.map((m) => (
              <View key={m.name} style={[styles.teamCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.teamAvatar}>
                  <Text style={styles.teamInitial}>{m.name.charAt(0)}</Text>
                </View>
                <View style={styles.teamInfo}>
                  <Text style={[styles.teamRole, { color: colors.textSecondary }]}>{m.role}</Text>
                  <Text style={[styles.teamName, { color: colors.text }]}>{m.name}</Text>
                  <Text style={[styles.teamDesc, { color: colors.textSecondary }]}>{m.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Contact */}
        <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.contactTitle, { color: colors.text }]}>Muloqot</Text>
          <Text style={[styles.contactText, { color: colors.textSecondary }]}>tahririyat@milliy-tiklanish.uz</Text>
          <Text style={[styles.contactText, { color: colors.textSecondary }]}>+998 71 123 45 67</Text>
          <Text style={[styles.contactText, { color: colors.textSecondary }]}>Toshkent, O'zbekiston</Text>
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
  teamList: { gap: 14 },
  teamCard: {
    flexDirection: "row",
    gap: 16,
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 18,
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
  teamInitial: {
    color: Palette.white,
    fontSize: 22,
    fontWeight: "800",
  },
  teamInfo: { flex: 1, gap: 2 },
  teamRole: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: Palette.beige,
    textTransform: "uppercase",
  },
  teamName: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.black,
  },
  teamDesc: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 19,
    marginTop: 2,
  },
  contactCard: {
    margin: 20,
    backgroundColor: Palette.creamDeep,
    borderRadius: 18,
    padding: 22,
    gap: 8,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  contactTitle: {
    fontSize: 16,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    marginBottom: 4,
  },
  contactText: {
    fontSize: 14,
    color: Palette.textSecondary,
    lineHeight: 22,
  },
});
