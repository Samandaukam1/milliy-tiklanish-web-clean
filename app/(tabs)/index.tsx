import { Image } from "expo-image";
import { router } from "expo-router";
import { Search, Bell } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import logo from "../../assets/images/milliy-tiklanish-logo.jpg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { ArticleCard } from "@/components/ArticleCard";
import { SectionTitle } from "@/components/SectionTitle";
import { TopAuthorsSection } from "@/components/TopAuthorsSection";
import { formatUzDate } from "@/utils/date";
import { fetchHomeData, fetchCategories, fetchTopAuthors, getPersonalizedArticles } from "@/lib/services";
import { useLanguage } from "@/providers/LanguageProvider";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";
import type { AppArticle, AppAuthor, AppCategory } from "@/lib/types";

function HeroGlow({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Inject CSS keyframes for web glow (once)
    if (Platform.OS === "web" && typeof document !== "undefined") {
      if (!document.getElementById("mt-hero-glow-kf")) {
        const s = document.createElement("style");
        s.id = "mt-hero-glow-kf";
        s.textContent = [
          "@keyframes mtHeroGlow {",
          "  0%   { box-shadow: 0 0 28px 6px rgba(237,28,36,0.52), 0 0 0 0 rgba(0,176,255,0.0); border-color: rgba(237,28,36,0.55); }",
          "  33%  { box-shadow: 0 0 38px 9px rgba(237,28,36,0.28), 0 0 26px 5px rgba(0,176,255,0.32); border-color: rgba(0,140,220,0.45); }",
          "  66%  { box-shadow: 0 0 42px 11px rgba(0,176,255,0.40), 0 0 18px 4px rgba(237,28,36,0.18); border-color: rgba(0,176,255,0.55); }",
          "  100% { box-shadow: 0 0 28px 6px rgba(237,28,36,0.52), 0 0 0 0 rgba(0,176,255,0.0); border-color: rgba(237,28,36,0.55); }",
          "}",
        ].join("\n");
        document.head.appendChild(s);
      }
      return;
    }

    // Native: animated shadow
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 1800, useNativeDriver: false }),
      ])
    ).start();
  }, [anim]);

  const shadowColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#ED1C24", "#F5C542"],
  });

  const shadowRadius = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 18],
  });

  const shadowOpacity = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.55, 0.85, 0.55],
  });

  if (Platform.OS === "web") {
    return (
      <View
        style={[
          styles.heroGlowWebWrap,
          Platform.select({ web: { animation: "mtHeroGlow 2.8s ease-in-out infinite" } as any }),
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      style={{
        marginHorizontal: 20,
        marginTop: 10,
        borderRadius: 24,
        shadowColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity,
        shadowRadius,
        elevation: 12,
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { deviceUserId } = useApp();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isDesktop = isWeb && width >= 1024;
  const desktopCardWidth = width >= 1280 ? "31.8%" : "48.8%";
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [featured, setFeatured] = useState<AppArticle | null>(null);
  const [trending, setTrending] = useState<AppArticle[]>([]);
  const [latest, setLatest] = useState<AppArticle[]>([]);
  const [personalized, setPersonalized] = useState<AppArticle[]>([]);
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const [topAuthors, setTopAuthors] = useState<AppAuthor[]>([]);

  const load = useCallback(async () => {
    try {
      setError(null);

      // fetchHomeData has its own internal fallbacks — will not throw
      const homeData = await fetchHomeData(language as any).catch((e) => {
        if (__DEV__) console.error("[HomeScreen] fetchHomeData error:", e);
        return { featured: null, trending: [] as any[], latest: [] as any[] };
      });
      setFeatured(homeData.featured);
      setTrending(homeData.trending);
      setLatest(homeData.latest);

      // Secondary data — failures here must not block the screen
      const [cats, authors] = await Promise.allSettled([
        fetchCategories(language as any),
        fetchTopAuthors(language as any),
      ]);

      if (cats.status === "fulfilled") setCategories(cats.value);
      if (authors.status === "fulfilled") setTopAuthors(authors.value);

      // Personalized recommendations — fire and forget
      if (deviceUserId) {
        getPersonalizedArticles(deviceUserId, language as any)
          .then(setPersonalized)
          .catch(() => {});
      }

    } catch (e) {
      if (__DEV__) console.error("[HomeScreen] load error:", e);
      setError("Ma'lumotlarni yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  }, [deviceUserId, language]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ─── DESKTOP LAYOUT ───────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={Palette.red} />
          </View>
        )}
        {!loading && error && (
          <View style={{ paddingVertical: 16, alignItems: "center", paddingHorizontal: 20 }}>
            <Text style={{ color: Palette.textSecondary, textAlign: "center", fontSize: 13 }}>{error}</Text>
          </View>
        )}
        {!loading && (
          <View style={styles.desktopWrapper}>
            {/* ── Left column ────────────────────────────────────────────── */}
            <View style={styles.desktopLeft}>
              {featured ? (
                <View
                  style={[
                    styles.desktopHeroGlowWrap,
                    Platform.select({ web: { animation: "mtHeroGlow 2.8s ease-in-out infinite" } as any }),
                  ]}
                >
                  <ArticleCard article={featured} variant="hero" />
                </View>
              ) : (
                <View style={[styles.desktopEmptyHero, { backgroundColor: colors.card }]}>
                  <Text style={{ color: Palette.textSecondary }}>Hozircha maqolalar mavjud emas</Text>
                </View>
              )}

              {trending.length > 0 && (
                <View style={{ marginTop: 36 }}>
                  <SectionTitle kicker="Trend" title="Eng ko'p o'qilgan" action="Barchasi" />
                  <View style={styles.desktopEditorialGrid}>
                    {trending.slice(0, 6).map((item, index) => (
                      <View key={item.id} style={[styles.desktopEditorialItem, { width: desktopCardWidth }]}>
                        <ArticleCard
                          article={item}
                          variant="editorial"
                          containerStyle={{ width: "100%" }}
                          editorialMediaStyle={isWeb ? styles.webEditorialMedia : undefined}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {personalized.length > 0 && (
                <View style={{ marginTop: 36 }}>
                  <SectionTitle kicker="Siz uchun" title="Tavsiya etiladi" />
                  <View style={styles.desktopEditorialGrid}>
                    {personalized.slice(0, 6).map((item) => (
                      <View key={item.id} style={[styles.desktopEditorialItem, { width: desktopCardWidth }]}>
                        <ArticleCard
                          article={item}
                          variant="editorial"
                          containerStyle={{ width: "100%" }}
                          editorialMediaStyle={isWeb ? styles.webEditorialMedia : undefined}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {categories.length > 0 && (
                <View style={{ marginTop: 36 }}>
                  <SectionTitle kicker="Ruknlar" title="Asosiy yo'nalishlar" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {categories.slice(0, 12).map((c, i) => (
                      <Pressable
                        key={c.id}
                        style={[styles.catChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => router.push({ pathname: "/(tabs)/articles", params: { cat: c.id } })}
                      >
                        <Text style={styles.catChipNum}>{String(i + 1).padStart(2, "0")}</Text>
                        <Text style={[styles.catChipText, { color: colors.text }]}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {latest.length > 0 && (
                <View style={{ marginTop: 36 }}>
                  <SectionTitle kicker="Yangiliklar" title="So'nggi yangiliklar" />
                  <View style={[styles.desktopEditorialGrid, { marginTop: 16 }]}>
                    {latest.map((a) => (
                      <View key={a.id} style={[styles.desktopEditorialItem, { width: desktopCardWidth }]}>
                        <ArticleCard
                          article={a}
                          variant="editorial"
                          containerStyle={{ width: "100%" }}
                          editorialMediaStyle={isWeb ? styles.webEditorialMedia : undefined}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* ── Right sidebar ───────────────────────────────────────────── */}
            <View style={styles.desktopRight}>
              {topAuthors.length > 0 && (
                <TopAuthorsSection
                  authors={topAuthors}
                  onSeeAll={() => router.push("/authors")}
                  sidebar
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  // ─── MOBILE LAYOUT ────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 160 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Palette.red} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.liveWrap}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>BUGUN</Text>
          </View>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatUzDate()}</Text>
          <View style={styles.headerActions}>
            <Pressable
              testID="home-search"
              onPress={() => router.push("/search")}
              style={[styles.iconBtn, { backgroundColor: colors.iconBg, borderColor: colors.border }]}
            >
              <Search size={18} color={colors.iconColor} />
            </Pressable>
            <Pressable style={[styles.iconBtn, { backgroundColor: colors.iconBg, borderColor: colors.border }]}>
              <Bell size={18} color={colors.iconColor} />
            </Pressable>
          </View>
        </View>
        <Image source={logo} style={styles.logoImage} contentFit="contain" />
      </View>

      {loading && (
        <View style={{ paddingVertical: 60, alignItems: "center" }}>
          <ActivityIndicator color={Palette.red} />
        </View>
      )}

      {!loading && error && (
        <View style={{ paddingVertical: 16, alignItems: "center", paddingHorizontal: 20 }}>
          <Text style={{ color: Palette.textSecondary, textAlign: "center", fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {!loading && (
        <>
          {featured ? (
            <HeroGlow>
              <ArticleCard article={featured} variant="hero" />
            </HeroGlow>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingVertical: 24, alignItems: "center" }}>
              <Text style={{ color: Palette.textSecondary, fontSize: 14 }}>Hozircha maqolalar mavjud emas</Text>
            </View>
          )}

          {trending.length > 0 && (
            <View style={styles.section}>
              <SectionTitle kicker="Trend" title="Eng ko'p o'qilgan" action="Barchasi" />
              <FlatList
                data={trending}
                keyExtractor={(i) => i.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <ArticleCard article={item} variant="compact" rank={index + 1} />
                )}
                contentContainerStyle={{ paddingRight: 20 }}
              />
            </View>
          )}

          {personalized.length > 0 && (
            <View style={styles.section}>
              <SectionTitle kicker="Siz uchun" title="Tavsiya etiladi" />
              <FlatList
                data={personalized}
                keyExtractor={(i) => i.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <ArticleCard article={item} variant="compact" />
                )}
                contentContainerStyle={{ paddingRight: 20 }}
              />
            </View>
          )}

          {topAuthors.length > 0 && (
            <View style={[styles.section, { paddingHorizontal: 0 }]}>
              <TopAuthorsSection authors={topAuthors} onSeeAll={() => router.push("/authors")} />
            </View>
          )}

          {categories.length > 0 && (
            <View style={styles.section}>
              <SectionTitle kicker="Ruknlar" title="Asosiy yo'nalishlar" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {categories.slice(0, 12).map((c, i) => (
                  <Pressable
                    key={c.id}
                    style={[styles.catChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.push({ pathname: "/(tabs)/articles", params: { cat: c.id } })}
                  >
                    <Text style={styles.catChipNum}>{String(i + 1).padStart(2, "0")}</Text>
                    <Text style={[styles.catChipText, { color: colors.text }]}>{c.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {latest.length > 0 && (
            <View style={styles.section}>
              <SectionTitle kicker="Yangiliklar" title="So'nggi yangiliklar" />
              <View style={{ gap: 20 }}>
                {latest.map((a, i) => (
                  <View key={a.id}>
                    <ArticleCard article={a} variant={i === 2 ? "large" : "list"} />
                    {i < latest.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  </View>
                ))}
              </View>
            </View>
          )}

          {!loading && !featured && latest.length === 0 && (
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <Text style={{ color: Palette.textSecondary }}>Hozircha maqolalar mavjud emas</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 0,
    backgroundColor: Palette.cream,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  liveWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Palette.red,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.white },
  liveText: { color: Palette.white, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  dateText: { flex: 1, color: Palette.textSecondary, fontSize: 12 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  logoImage: {
    width: "76%",
    height: 64,
    marginTop: 4,
    marginBottom: 8,
    marginLeft: 0,
    alignSelf: "flex-start",
    backgroundColor: "transparent",
  },
  heroGlowWebWrap: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(237,28,36,0.55)",
    overflow: "hidden",
  },
  desktopHeroGlowWrap: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(237,28,36,0.55)",
    overflow: "hidden",
  },
  section: { paddingHorizontal: 20, marginTop: 10 },
  catChip: {
    backgroundColor: Palette.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#ECE6D8",
    minWidth: 120,
  },
  catChipNum: { color: Palette.red, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  catChipText: { color: Palette.black, fontSize: 15, fontWeight: "700", marginTop: 4, fontFamily: Fonts.serif },
  divider: { height: 1, backgroundColor: "#ECE6D8", marginTop: 20 },
  // ─── Desktop only ─────────────────────────────────────────────────────────
  desktopWrapper: {
    maxWidth: 1280,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: 28,
    paddingTop: 28,
    flexDirection: "row",
    gap: 32,
    alignItems: "flex-start",
  },
  desktopLeft: {
    flex: 1,
    minWidth: 0,
  },
  desktopRight: {
    width: 300,
  },
  desktopEditorialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 16,
    alignItems: "flex-start",
  },
  desktopEditorialItem: {
    minWidth: 0,
  },
  webEditorialMedia: {
    aspectRatio: 7 / 5,
  },
  desktopEmptyHero: {
    aspectRatio: 16 / 9,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
