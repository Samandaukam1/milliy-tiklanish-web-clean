import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Crown, Download, ChevronRight } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { ArticleCard } from "@/components/ArticleCard";
import { fetchIssueById, fetchIssueArticlesFull } from "@/lib/services";
import { useLanguage } from "@/providers/LanguageProvider";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";
import type { AppArticle, AppIssue } from "@/lib/types";

export default function IssueDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { subscription } = useApp();
  const isPremium = subscription !== "free";
  const [showPdfPrompt, setShowPdfPrompt] = useState(false);
  const { language } = useLanguage();
  const colors = useColors();
  const [issue, setIssue] = useState<AppIssue | null>(null);
  const [articles, setArticles] = useState<AppArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [iss, arts] = await Promise.all([
        fetchIssueById(id, language as any),
        fetchIssueArticlesFull(id, language as any),
      ]);
      setIssue(iss);
      setArticles(arts);
    } finally {
      setLoading(false);
    }
  }, [id, language]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={Palette.red} />
      </View>
    );
  }

  if (!issue) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: Palette.textSecondary }}>Son topilmadi</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={{ color: Palette.red, fontWeight: "700" }}>Orqaga</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Premium PDF prompt modal (web only) */}
      <Modal
        visible={showPdfPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPdfPrompt(false)}
      >
        <Pressable
          style={styles.premiumPromptOverlay}
          onPress={() => setShowPdfPrompt(false)}
        >
          <Pressable
            style={styles.premiumPromptCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.premiumPromptIcon}>
              <Crown size={24} color={Palette.white} />
            </View>
            <Text style={styles.premiumPromptTitle}>Gazeta Premium</Text>
            <Text style={styles.premiumPromptText}>
              {"Gazetaning PDF ko'rinishini yuklab olish uchun Gazeta Premium tarifiga obuna bo'ling."}
            </Text>
            <Pressable
              style={styles.premiumPromptBtn}
              onPress={() => { setShowPdfPrompt(false); router.push("/subscribe"); }}
            >
              <Text style={styles.premiumPromptBtnText}>Premium obunani boshlash</Text>
            </Pressable>
            <Pressable
              style={styles.premiumPromptCloseBtn}
              onPress={() => setShowPdfPrompt(false)}
            >
              <Text style={{ color: Palette.textSecondary, fontSize: 13, fontWeight: "600" }}>Yopish</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.heroWrap}>
          <Image source={{ uri: issue.cover }} style={styles.heroImage} contentFit="contain" />
          <View style={styles.heroOverlay}>
            {/* Back btn */}
            <Pressable
              onPress={() => router.back()}
              style={[styles.backBtn, { marginTop: insets.top + 8 }]}
            >
              <ArrowLeft size={20} color={Palette.white} />
            </Pressable>
            <View style={styles.heroMeta}>
              <Text style={styles.issueBadge}>SON #{issue.number}</Text>
              <Text style={styles.heroTitle}>{issue.title}</Text>
            </View>
          </View>
        </View>

        {/* PDF download */}
        {issue.pdfUrl && (
          <Pressable
            style={styles.pdfBtn}
            onPress={() => {
              if (Platform.OS === "web" && !isPremium) {
                setShowPdfPrompt(true);
                return;
              }
              Linking.openURL(issue.pdfUrl!).catch(() => {});
            }}
          >
            {Platform.OS === "web" && !isPremium ? (
              <Crown size={18} color={Palette.white} />
            ) : (
              <Download size={18} color={Palette.white} />
            )}
            <Text style={styles.pdfBtnText}>PDF yuklab olish</Text>
          </Pressable>
        )}

        {/* Premium PDF prompt (web only) */}

        {/* Table of contents / articles */}
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>MUNDARIJA</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Ushbu sondagi maqolalar</Text>
        </View>

        {articles.length > 0 ? (
          <View style={styles.tocList}>
            {articles.map((a, i) => (
              <Pressable
                key={a.id}
                style={[styles.tocItem, { borderBottomColor: colors.border }]}
                onPress={() =>
                  router.push({ pathname: "/article/[id]", params: { id: a.id } })
                }
              >
                <Text style={styles.tocNum}>{String(i + 1).padStart(2, "00")}</Text>
                <View style={styles.tocInfo}>
                  <Text style={[styles.tocTitle, { color: colors.text }]} numberOfLines={2}>
                    {a.title}
                  </Text>
                  <Text style={[styles.tocMeta, { color: colors.textSecondary }]}>
                    {a.authorName} · {a.readMinutes} daq
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: Palette.textSecondary }}>
              Bu sonda maqolalar topilmadi
            </Text>
          </View>
        )}

        {/* Full article cards */}
        {articles.length > 0 && (
          <View style={styles.articleCards}>
            <Text style={[styles.sectionKicker, { color: colors.textSecondary }]}>BARCHA MAQOLALAR</Text>
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} variant="list" />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Palette.cream },
  scroll: { paddingBottom: 80 },
  heroWrap: {
    width: "100%",
    position: "relative",
    backgroundColor: "transparent",
  },
  heroImage: {
    width: "100%",
    aspectRatio: 0.7,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
    justifyContent: "space-between",
    padding: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  heroMeta: { gap: 8 },
  issueBadge: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: Palette.white,
    backgroundColor: Palette.red,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.white,
    lineHeight: 34,
  },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Palette.red,
    margin: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  pdfBtnText: {
    color: Palette.white,
    fontSize: 15,
    fontWeight: "700",
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 4,
  },
  sectionKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: Palette.red,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
  },
  tocList: {
    marginHorizontal: 20,
    backgroundColor: Palette.white,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  tocItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ECE6D8",
  },
  tocNum: {
    fontSize: 13,
    fontWeight: "800",
    color: Palette.red,
    width: 24,
  },
  tocInfo: { flex: 1, gap: 3 },
  tocTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Palette.black,
    lineHeight: 20,
  },
  tocMeta: {
    fontSize: 11,
    color: Palette.textSecondary,
  },
  articleCards: {
    padding: 20,
    gap: 16,
    marginTop: 8,
  },
  backLink: {
    marginTop: 16,
    padding: 12,
  },
  premiumPromptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  premiumPromptCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 12,
  },
  premiumPromptIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  premiumPromptTitle: {
    fontSize: 19,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    textAlign: "center",
  },
  premiumPromptText: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 21,
    textAlign: "center",
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  premiumPromptBtn: {
    backgroundColor: Palette.red,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    width: "100%",
    alignItems: "center",
  },
  premiumPromptBtnText: {
    color: Palette.white,
    fontSize: 14,
    fontWeight: "800",
  },
  premiumPromptCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
