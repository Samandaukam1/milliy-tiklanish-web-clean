import { router, useLocalSearchParams } from "expo-router";
import { Crown, Download, FileText, Newspaper, Search, X } from "lucide-react-native";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { ArticleCard } from "@/components/ArticleCard";
import { IssueCard } from "@/components/IssueCard";
import { IssueCardSimple } from "@/components/IssueCardSimple";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchArticles, fetchCategories, fetchIssues, fetchIssueArticlesFull } from "@/lib/services";
import { useLanguage } from "@/providers/LanguageProvider";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";
import type { AppArticle, AppCategory, AppIssue } from "@/lib/types";

export default function ArticlesScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ cat?: string }>();
  const { language } = useLanguage();
  const colors = useColors();
  const [activeCat, setActiveCat] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "popular">("newest");
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const [articles, setArticles] = useState<AppArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestIssue, setLatestIssue] = useState<AppIssue | null>(null);
  const [issueArticles, setIssueArticles] = useState<AppArticle[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isWebDesktop = Platform.OS === "web" && isDesktop;
  const isWideDesktop = width >= 1280;
  const isTablet = width >= 720;
  const articleColumnCount = isWideDesktop ? 3 : isTablet ? 2 : 1;
  const useNewspaperColumns = articleColumnCount > 1;

  useEffect(() => {
    if (params.cat) setActiveCat(params.cat);
  }, [params.cat]);

  const loadCategories = useCallback(async () => {
    const [cats, issues] = await Promise.all([
      fetchCategories(language as any),
      fetchIssues(language as any),
    ]);
    setCategories(cats);
    if (issues.length > 0) {
      setLatestIssue(issues[0]);
      const arts = await fetchIssueArticlesFull(issues[0].id, language as any);
      setIssueArticles(arts);
    }
  }, [language]);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const catId = activeCat === "all" ? undefined : activeCat;
      const data = await fetchArticles(language as any, catId);
      setArticles(data);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [language, activeCat]);

  // Sort articles client-side
  const sortedArticles = React.useMemo(() => {
    if (sortBy === "popular") {
      return [...articles].sort((a, b) =>
        ((b as any).viewCount ?? 0) - ((a as any).viewCount ?? 0)
      );
    }
    return [...articles].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }, [articles, sortBy]);

  const articleColumns = React.useMemo(() => {
    const columns = Array.from({ length: articleColumnCount }, () => [] as { article: AppArticle; index: number }[]);
    sortedArticles.forEach((article, index) => {
      columns[index % articleColumnCount].push({ article, index });
    });
    return columns;
  }, [articleColumnCount, sortedArticles]);

  const currentIssueHeader =
    latestIssue && activeCat === "all" ? (
      <View style={{ marginBottom: 24 }}>
        <SectionTitle kicker="Gazeta Soni" title="Joriy son" />
        <View style={[styles.currentIssueWrap, { marginTop: 14 }]}>
          {isWebDesktop ? (
            <WebCurrentIssueCard issue={latestIssue} articles={issueArticles} />
          ) : isDesktop ? (
            <IssueCard issue={latestIssue} articles={issueArticles} showTableOfContents={true} />
          ) : (
            <IssueCardSimple issue={latestIssue} />
          )}
        </View>
      </View>
    ) : null;

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadArticles(); }, [loadArticles]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: isDesktop ? 0 : insets.top }}>
      {/* Page header */}
      <View style={[styles.header, isDesktop && styles.headerDesktop]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>MAQOLALAR</Text>
          <Text style={[styles.title, { color: colors.text }]}>{"Barcha yo'nalishlar"}</Text>
        </View>
        <Pressable
          testID="articles-search"
          onPress={() => router.push("/search")}
          style={({ hovered }: any) => [
            styles.iconBtn,
            { backgroundColor: hovered ? "#F5F0E8" : colors.iconBg, borderColor: colors.border },
          ]}
        >
          <Search size={18} color={colors.iconColor} />
        </Pressable>
      </View>

      {/* Categories + Sort toolbar */}
      <View style={[styles.toolbarRow, isDesktop && styles.toolbarRowDesktop]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={{ flex: 1 }}
        >
          <CategoryTab label="Barchasi" active={activeCat === "all"} onPress={() => setActiveCat("all")} />
          {categories.map((c) => (
            <CategoryTab
              key={c.id}
              label={c.name}
              active={activeCat === c.id}
              onPress={() => setActiveCat(c.id)}
            />
          ))}
        </ScrollView>

        {/* Sort toggle */}
        <View style={[styles.sortRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Pressable
            onPress={() => setSortBy("newest")}
            style={[styles.sortBtn, sortBy === "newest" && styles.sortBtnActive]}
          >
            <Text style={[styles.sortBtnText, { color: sortBy === "newest" ? Palette.white : colors.textSecondary }]}>
              Yangi
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSortBy("popular")}
            style={[styles.sortBtn, sortBy === "popular" && styles.sortBtnActive]}
          >
            <Text style={[styles.sortBtnText, { color: sortBy === "popular" ? Palette.white : colors.textSecondary }]}>
              Mashhur
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Palette.red} />
        </View>
      ) : sortedArticles.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: Palette.textSecondary }}>Hozircha maqolalar mavjud emas</Text>
        </View>
      ) : useNewspaperColumns ? (
        <ScrollView
          contentContainerStyle={[
            styles.listContainer,
            isDesktop && styles.desktopContainer,
            styles.newspaperScrollContainer,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {currentIssueHeader}
          <View style={styles.newspaperGrid}>
            {articleColumns.map((column, columnIndex) => (
              <View key={`article-column-${columnIndex}`} style={styles.newspaperColumn}>
                {column.map(({ article, index }) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    variant={index === 0 && activeCat === "all" ? "large" : "newspaper"}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={sortedArticles}
          keyExtractor={(i) => i.id}
          numColumns={1}
          key="articles-single-column"
          contentContainerStyle={[
            styles.listContainer,
            isDesktop && styles.desktopContainer,
          ]}
          ListHeaderComponent={currentIssueHeader}
          renderItem={({ item, index }) => (
            <ArticleCard
              article={item}
              variant={index === 0 && activeCat === "all" ? "large" : "list"}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function WebCurrentIssueCard({
  issue,
  articles,
}: {
  issue: AppIssue;
  articles: AppArticle[];
}) {
  const { subscription } = useApp();
  const isPremium = subscription !== "free";
  const [showPremiumPrompt, setShowPremiumPrompt] = useState(false);

  const openPdf = (e?: any) => {
    e?.stopPropagation?.();
    if (!isPremium) {
      setShowPremiumPrompt(true);
      return;
    }
    if (issue.pdfUrl) Linking.openURL(issue.pdfUrl).catch(() => {});
  };

  const goToIssue = () =>
    router.push({ pathname: "/issue/[id]", params: { id: issue.id } });

  const goToArticle = (id: string, e?: any) => {
    e?.stopPropagation?.();
    router.push({ pathname: "/article/[id]", params: { id } });
  };

  return (
    <>
      {/* Premium PDF prompt modal */}
      <Modal
        visible={showPremiumPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPremiumPrompt(false)}
      >
        <Pressable
          style={styles.pdfPremiumOverlay}
          onPress={() => setShowPremiumPrompt(false)}
        >
          <Pressable
            style={styles.pdfPremiumCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pdfPremiumIconWrap}>
              <Crown size={26} color={Palette.white} />
            </View>
            <Text style={styles.pdfPremiumTitle}>Gazeta Premium</Text>
            <Text style={styles.pdfPremiumText}>
              {"Gazetaning PDF ko'rinishini yuklab olish uchun Gazeta Premium tarifiga obuna bo'ling."}
            </Text>
            <Pressable
              onPress={() => { setShowPremiumPrompt(false); router.push("/subscribe"); }}
              style={({ hovered }: any) => [styles.pdfPremiumBtn, hovered && { opacity: 0.88 }]}
            >
              <Text style={styles.pdfPremiumBtnText}>{"Premium obunani boshlash"}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowPremiumPrompt(false)}
              style={styles.pdfPremiumClose}
            >
              <X size={18} color={"#888"} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Pressable
        onPress={goToIssue}
        style={({ pressed, hovered }: any) => [
          styles.webIssueCard,
          hovered && styles.webIssueCardHovered,
          pressed && styles.webIssueCardPressed,
        ]}
      >
      <View style={styles.webIssueCoverShell}>
        <Image
          source={{ uri: issue.cover }}
          style={styles.webIssueCover}
          contentFit="contain"
          contentPosition="center"
        />
      </View>

      <View style={styles.webIssueContent}>
        <View style={styles.webIssueTextBlock}>
          <Text style={styles.webIssueTitle} numberOfLines={2}>
            {issue.title}
          </Text>
          <Text style={styles.webIssueSubtitle}>Milliy Tiklanish gazetasi</Text>
        </View>

        {articles.length > 0 && (
          <View style={styles.webIssueChips}>
            {articles.slice(0, 4).map((article) => (
              <Pressable
                key={article.id}
                onPress={(e) => goToArticle(article.id, e)}
                style={({ pressed, hovered }: any) => [
                  styles.webIssueChip,
                  hovered && styles.webIssueChipHovered,
                  pressed && styles.webIssueChipPressed,
                ]}
              >
                <Newspaper size={18} color="#888888" strokeWidth={1.8} style={styles.webIssueChipIcon} />
                <Text style={styles.webIssueChipText} numberOfLines={2}>
                  {article.title}
                </Text>
                {article.tier !== "free" && (
                  <View style={styles.webIssuePremiumDot}>
                    <Crown size={9} color={Palette.gold} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.webIssueActions}>
          <Pressable
            onPress={goToIssue}
            style={({ pressed, hovered }: any) => [
              styles.webReadButton,
              hovered && styles.webReadButtonHovered,
              pressed && styles.webButtonPressed,
            ]}
          >
            <FileText size={16} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.webReadButtonText}>{"O'qish"}</Text>
          </Pressable>

          {issue.pdfUrl && (
            <Pressable
              onPress={openPdf}
              style={({ pressed, hovered }: any) => [
                styles.webPdfButton,
                hovered && styles.webPdfButtonHovered,
                pressed && styles.webButtonPressed,
              ]}
            >
              {isPremium ? (
                <Download size={16} color={Palette.red} strokeWidth={2.2} />
              ) : (
                <Crown size={16} color={Palette.red} strokeWidth={2.2} />
              )}
              <Text style={styles.webPdfButtonText}>PDF</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
    </>
  );
}

function CategoryTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={styles.tab} testID={`cat-${label}`}>
      <Text style={[styles.tabText, { color: active ? colors.text : colors.textSecondary }, active && styles.tabTextActive]}>{label}</Text>
      {active && <View style={styles.tabUnderline} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerDesktop: {
    maxWidth: 1280,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: 28,
    marginTop: 20,
    paddingBottom: 18,
  },
  kicker: { color: Palette.red, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  title: {
    fontSize: 28,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    marginTop: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    ...Platform.select({
      web: { transitionProperty: "background-color", transitionDuration: "150ms", cursor: "pointer" },
    }),
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#ECE6D8",
  },
  toolbarRowDesktop: {
    maxWidth: 1280,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: 28,
    paddingRight: 28,
    borderBottomWidth: 1,
    borderBottomColor: "#ECE6D8",
  },
  tabsRow: { paddingHorizontal: 20, gap: 4, paddingBottom: 12, paddingTop: 4 },
  tab: { paddingVertical: 10, paddingHorizontal: 12, alignItems: "center" },
  tabText: { color: Palette.textSecondary, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: Palette.black, fontWeight: "800" },
  tabUnderline: {
    position: "absolute",
    bottom: 4,
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: Palette.red,
    borderRadius: 1,
  },
  sortRow: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 10,
    flexShrink: 0,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sortBtnActive: {
    backgroundColor: Palette.red,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  divider: { height: 12 },
  listContainer: { padding: 20, paddingBottom: 160, gap: 0 },
  desktopContainer: { maxWidth: 1280, marginHorizontal: "auto", paddingHorizontal: 28 },
  currentIssueWrap: { width: "100%", alignItems: "center" },
  webIssueCard: {
    width: "100%",
    minHeight: 390,
    flexDirection: "row",
    alignItems: "center",
    gap: 40,
    paddingHorizontal: 34,
    paddingVertical: 38,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: Palette.red,
    backgroundColor: "#FAF7F2",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 14px 30px rgba(17,17,17,0.05)",
        transitionProperty: "transform, box-shadow",
        transitionDuration: "180ms",
        cursor: "pointer",
      },
      default: {
        shadowColor: "#111111",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 4,
      },
    }),
  },
  webIssueCardHovered: {
    ...Platform.select({
      web: {
        boxShadow: "0 18px 36px rgba(17,17,17,0.07)",
      },
    }),
  },
  webIssueCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  webIssueCoverShell: {
    width: 220,
    aspectRatio: 0.707,
    flexShrink: 0,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      web: {
        boxShadow: "0 18px 34px rgba(17,17,17,0.16)",
      },
      default: {
        shadowColor: "#111111",
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
        elevation: 5,
      },
    }),
  },
  webIssueCover: {
    width: "100%",
    height: "100%",
  },
  webIssueContent: {
    flex: 1,
    minWidth: 0,
    gap: 18,
    justifyContent: "center",
  },
  webIssueTextBlock: {
    gap: 6,
  },
  webIssueTitle: {
    color: Palette.black,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    fontFamily: Fonts.serif,
  },
  webIssueSubtitle: {
    color: "#888888",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    fontFamily: Fonts.sans,
  },
  webIssueChips: {
    gap: 16,
    ...Platform.select({
      web: {
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
      } as any,
    }),
  },
  webIssueChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 78,
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EBE8E2",
    ...Platform.select({
      web: {
        transitionProperty: "background-color, transform",
        transitionDuration: "150ms",
        cursor: "pointer",
        boxShadow: "0 8px 18px rgba(17,17,17,0.045)",
      },
      default: {
        shadowColor: "#111111",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
      },
    }),
  },
  webIssueChipHovered: {
    backgroundColor: "#FCFBF8",
  },
  webIssueChipPressed: {
    transform: [{ scale: 0.98 }],
  },
  webIssueChipIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  webIssueChipText: {
    flex: 1,
    minWidth: 0,
    color: Palette.black,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    fontFamily: Fonts.sans,
  },
  webIssuePremiumDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
  },
  webIssueActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 4,
  },
  webReadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Palette.red,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 118,
    ...Platform.select({
      web: {
        transitionProperty: "opacity, transform",
        transitionDuration: "150ms",
        cursor: "pointer",
      },
    }),
  },
  webReadButtonHovered: {
    opacity: 0.92,
  },
  webReadButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  webPdfButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.red,
    backgroundColor: "transparent",
    paddingHorizontal: 18,
    paddingVertical: 11,
    minWidth: 92,
    ...Platform.select({
      web: {
        transitionProperty: "background-color, transform",
        transitionDuration: "150ms",
        cursor: "pointer",
      },
    }),
  },
  webPdfButtonHovered: {
    backgroundColor: "rgba(237,28,36,0.06)",
  },
  webPdfButtonText: {
    color: Palette.red,
    fontSize: 14,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  webButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  // PDF Premium modal
  pdfPremiumOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  pdfPremiumCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    maxWidth: 440,
    width: "100%",
    alignItems: "center",
    gap: 12,
    ...Platform.select({
      web: { boxShadow: "0 24px 60px rgba(0,0,0,0.18)" } as any,
    }),
  },
  pdfPremiumIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  pdfPremiumTitle: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    textAlign: "center",
  },
  pdfPremiumText: {
    fontSize: 14,
    color: Palette.textSecondary,
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  pdfPremiumBtn: {
    backgroundColor: Palette.red,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
    width: "100%",
    alignItems: "center",
    ...Platform.select({
      web: { transitionProperty: "opacity", transitionDuration: "150ms", cursor: "pointer" } as any,
    }),
  },
  pdfPremiumBtnText: {
    color: Palette.white,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  pdfPremiumClose: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "pointer" } as any,
    }),
  },
  newspaperScrollContainer: { gap: 0 },
  newspaperGrid: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  newspaperColumn: {
    flex: 1,
    minWidth: 0,
    alignSelf: "flex-start",
    gap: 20,
  },
});
