import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowLeft, Bookmark, Clock, Crown, Eye, Headphones, Heart, MessageCircle, Share2, ZoomIn, ZoomOut } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image as RNImage,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { ArticleCard } from "@/components/ArticleCard";
import { SectionTitle } from "@/components/SectionTitle";
import { SocialEditorialBlock } from "@/components/SocialEditorialBlock";
import { PremiumBanner, PremiumLockModal } from "@/components/PremiumComponents";
import { CommentsSection } from "@/components/CommentsSection";
import { createPaymePayment, getArticleAccess, getReturnUrlBase } from "@/lib/payments";
import { fetchArticleBlocks, fetchRelatedArticles, fetchIssueArticles, fetchEditorialRecommendations, extractYouTubeId, localizeField, incrementViewCount, fetchLikesCount, fetchUserLiked, likeArticle, unlikeArticle, trackView, trackInterest, fetchCommentsCount } from "@/lib/services";
import { supabase } from "@/lib/supabase";
import { relativeUz } from "@/utils/date";
import { useApp } from "@/providers/AppProvider";
import { usePlayer } from "@/providers/PlayerProvider";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";
import type { AppArticle, AppBlock, DbArticle } from "@/lib/types";

const brandLogo = require("../../assets/images/milliy-tiklanish-logo.jpg");

function formatViewCount(real: number): string {
  const v = Math.round(real * 4.73);
  if (v >= 10000) return `${Math.round(v / 1000)}K ko'rish`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K ko'rish`;
  return `${v} ko'rish`;
}

const FONT_SIZE_KEY = "article_font_size";
const FONT_SIZE_MIN = 14;
const FONT_SIZE_MAX = 26;
const FONT_SIZE_DEFAULT = 18;
const FONT_SIZE_STEP = 2;

function normalizeArticleDetailRow(row: DbArticle, lang: string): AppArticle {
  return {
    id: String(row.id),
    title: localizeField(row as any, "title", lang as any) || "—",
    excerpt: localizeField(row as any, "summary", lang as any) || "",
    cover: row.featured_image_url || "https://images.unsplash.com/photo-1524230572899-a752b3835840?w=800",
    categoryId: row.category_id || "",
    categoryName: row.category_hint || "Yangiliklar",
    authorName: row.author_name || "Tahririyat",
    publishedAt: row.published_at || row.created_at || new Date().toISOString(),
    readMinutes: row.read_time_minutes || 3,
    tier: row.is_premium ? "premium" : "free",
    is_featured: row.is_featured ?? false,
    viewCount: row.view_count ?? 0,
    likesCount: row.likes_count ?? 0,
    commentsCount: row.comments_count ?? 0,
    audio_url: row.audio_url,
    slug: row.slug,
    issue_id: row.issue_id ?? null,
    title_uz: row.title_uz,
    title_uz_cy: row.title_uz_cy,
    title_ru: row.title_ru,
    title_en: row.title_en,
    summary_uz: row.summary_uz,
    summary_uz_cy: row.summary_uz_cy,
    summary_ru: row.summary_ru,
    summary_en: row.summary_en,
    content_uz: row.content_uz,
    content_uz_cy: row.content_uz_cy,
    content_ru: row.content_ru,
    content_en: row.content_en,
    author_image_url: row.author_image_url,
    author_bio_uz: row.author_bio_uz,
    author_bio_uz_cy: row.author_bio_uz_cy,
    author_bio_ru: row.author_bio_ru,
    author_bio_en: row.author_bio_en,
  };
}

export default function ArticleDetail() {
  const params = useLocalSearchParams();
  const rawId = params.id;
  const articleId = typeof rawId === "string"
    ? rawId
    : Array.isArray(rawId)
      ? rawId[0]
      : null;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const heroHeight = isDesktop ? 480 : Math.round(height * 0.48);
  const contentOverlap = isDesktop ? 0 : 48;
  const contentRadius = isDesktop ? 34 : 36;
  const scrollBottomPadding = insets.bottom + (isDesktop ? 64 : 48);
  const { isSaved, toggleSaved, subscription, deviceUserId, user } = useApp();
  const { play } = usePlayer();
  const { t, language } = useLanguage();
  const colors = useColors();
  const scrollY = React.useRef(new Animated.Value(0)).current;

  const [article, setArticle] = useState<AppArticle | null>(null);
  const [blocks, setBlocks] = useState<AppBlock[]>([]);
  const [related, setRelated] = useState<AppArticle[]>([]);
  const [recommendations, setRecommendations] = useState<AppArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // ── Engagement state ────────────────────────────────────────────────────
  const userId = user?.id ?? deviceUserId;
  const userDisplayName = user?.name ?? user?.email ?? user?.phone ?? `Mehmon`;
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [articlePaymentLoading, setArticlePaymentLoading] = useState(false);
  const likeAnim = useRef(new Animated.Value(1)).current;
  const [fontSize, setFontSize] = useState(FONT_SIZE_DEFAULT);
  const languageRef = useRef(language);
  const userIdRef = useRef(userId);
  const isDesktopRef = useRef(isDesktop);
  const subscriptionRef = useRef(subscription);
  languageRef.current = language;
  userIdRef.current = userId;
  isDesktopRef.current = isDesktop;
  subscriptionRef.current = subscription;

  const changeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prev + delta));
      AsyncStorage.setItem(FONT_SIZE_KEY, String(next)).catch(() => {});
      return next;
    });
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  }, []);

  useEffect(() => {
    console.log("[article native] params:", { id: articleId ?? null });
    console.log("[article native] articleId:", articleId);

    if (!articleId) {
      setArticle(null);
      setBlocks([]);
      setRelated([]);
      setRecommendations([]);
      setLiked(false);
      setLikesCount(0);
      setCommentsCount(0);
      setHasPremiumAccess(false);
      setShowPremiumModal(false);
      setLoading(false);
      setError("Maqola ID topilmadi");
      return;
    }

    let cancelled = false;

    async function loadArticle() {
      const currentLanguage = languageRef.current;
      const currentUserId = userIdRef.current;
      const currentIsDesktop = isDesktopRef.current;
      const currentSubscription = subscriptionRef.current;

      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("articles")
          .select("*")
          .eq("id", articleId)
          .maybeSingle();

        if (cancelled) return;

        if (error) throw error;

        if (!data) {
          setArticle(null);
          setBlocks([]);
          setRelated([]);
          setRecommendations([]);
          setLiked(false);
          setLikesCount(0);
          setCommentsCount(0);
          setHasPremiumAccess(false);
          setShowPremiumModal(false);
          setError("Maqola topilmadi");
          return;
        }

        const nextArticle = normalizeArticleDetailRow(data as DbArticle, currentLanguage);
        setArticle(nextArticle);
        setBlocks([]);
        setRelated([]);
        setRecommendations([]);
        setLiked(false);
        setLikesCount(0);
        setCommentsCount(0);
        setHasPremiumAccess(nextArticle.tier === "free");
        setShowPremiumModal(false);
        console.log("[article] loaded:", data?.id ?? null);

        incrementViewCount(String(articleId)).catch(() => {});
        if (currentUserId) {
          trackView(currentUserId, String(articleId), nextArticle.categoryId).catch(() => {});
        }

        try {
          const [nextBlocks, nextRelated, nextRecommendations, nextLikesCount, nextLiked, nextCommentsCount, accessResult] = await Promise.all([
            fetchArticleBlocks(String(articleId), currentLanguage as any),
            nextArticle.issue_id
              ? fetchIssueArticles(nextArticle.issue_id, nextArticle.id, currentLanguage as any)
              : fetchRelatedArticles(String(articleId), nextArticle.categoryId, currentLanguage as any),
            currentIsDesktop
              ? fetchEditorialRecommendations(currentLanguage as any)
              : Promise.resolve([] as AppArticle[]),
            fetchLikesCount(String(articleId)),
            fetchUserLiked(currentUserId, String(articleId)),
            fetchCommentsCount(String(articleId)),
            nextArticle.tier === "free"
              ? Promise.resolve({ allowed: true, source: "free" as const })
              : getArticleAccess(String(articleId), currentUserId).catch(() => ({
                  allowed: currentSubscription !== "free",
                  source: currentSubscription !== "free" ? "subscription" as const : "none" as const,
                })),
          ]);

          if (cancelled) return;

          const nextHasPremiumAccess = nextArticle.tier === "free" || accessResult.allowed;
          setBlocks(nextBlocks);
          setRelated(nextRelated);
          setRecommendations(nextRecommendations);
          setLikesCount(nextLikesCount);
          setLiked(nextLiked);
          setCommentsCount(nextCommentsCount);
          setHasPremiumAccess(nextHasPremiumAccess);
          setShowPremiumModal(nextArticle.tier === "premium" && !nextHasPremiumAccess);
        } catch (supportError) {
          if (__DEV__) {
            console.error("[ArticleDetail] supporting data error:", supportError);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setArticle(null);
          setBlocks([]);
          setRelated([]);
          setRecommendations([]);
          setLiked(false);
          setLikesCount(0);
          setCommentsCount(0);
          setHasPremiumAccess(false);
          setShowPremiumModal(false);
          setError(e instanceof Error ? e.message : "Maqola yuklanmadi");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadArticle();

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const saved = article ? isSaved(article.id) : false;

  const onShare = useCallback(async () => {
    if (!article || Platform.OS === "web") return;
    try {
      await Share.share({ message: `${article.title} — Milliy Tiklanish gazetasi` });
    } catch {}
  }, [article]);

  const onListen = useCallback(() => {
    if (!article) return;
    if (__DEV__) {
      console.log(
        "[ArticleDetail] onListen — article.id:",
        article.id,
        "title:",
        article.title,
        "audio_url:",
        article.audio_url ?? "NULL/MISSING"
      );
    }
    if (!article.audio_url) {
      if (__DEV__)
        console.warn("[ArticleDetail] audio_url is missing — not starting player");
      return;
    }
    const audioItem = {
      id: `aud-${article.id}`,
      articleId: article.id,
      title: article.title,
      author: article.authorName,
      cover: article.cover,
      durationSec: article.readMinutes * 60,
      categoryId: article.categoryId,
      audio_url: article.audio_url,
    };
    if (__DEV__)
      console.log(
        "[ArticleDetail] calling play() with audio_url:",
        audioItem.audio_url
      );
    play(audioItem);
    router.push("/player");
  }, [article, play]);

  const onBookmark = useCallback(() => {
    if (!article) return;
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    toggleSaved(article.id);
  }, [article, toggleSaved]);

  const onBuySingleArticle = useCallback(async () => {
    if (!article) {
      return;
    }

    setArticlePaymentLoading(true);
    try {
      const userIdForPayment = user?.id || deviceUserId || `u-${Date.now().toString(36)}`;
      const result = await createPaymePayment({
        userId: userIdForPayment,
        type: "article",
        articleId: article.id,
        returnUrlBase: getReturnUrlBase(),
        language,
      });

      if (result.error || !result.payment_url || !result.payment_id) {
        Alert.alert("Xatolik", result.error ?? "To'lov tizimiga ulanib bo'lmadi.");
        return;
      }

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.location.assign(result.payment_url);
        }
        return;
      }

      const browserResult = await WebBrowser.openAuthSessionAsync(
        result.payment_url,
        "rork-app://payment-result"
      );

      if (browserResult.type === "success") {
        setShowPremiumModal(false);
        router.replace(`/payment-result?payment_id=${result.payment_id}&type=article&article_id=${article.id}`);
        return;
      }

      if (browserResult.type === "cancel" || (browserResult as any).type === "dismiss") {
        Alert.alert("To'lov bekor qilindi", "Siz to'lov sahifasini yopib qo'ydingiz.");
      }
    } catch (error) {
      console.error("[ArticleDetail] article payment error:", error);
      Alert.alert("Xatolik", "To'lovni boshlab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setArticlePaymentLoading(false);
    }
  }, [article, deviceUserId, language, user?.id]);

  const onToggleLike = useCallback(() => {
    if (!article) return;
    const wasLiked = liked;
    // Optimistic update
    setLiked(!wasLiked);
    setLikesCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));
    // Animate
    Animated.sequence([
      Animated.spring(likeAnim, { toValue: 1.45, useNativeDriver: true }),
      Animated.spring(likeAnim, { toValue: 1, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    // Persist
    if (wasLiked) {
      unlikeArticle(userId, article.id).catch(() => {
        setLiked(true);
        setLikesCount((c) => c + 1);
      });
    } else {
      likeArticle(userId, article.id).catch(() => {
        setLiked(false);
        setLikesCount((c) => Math.max(0, c - 1));
      });
      // Boost category interest on like
      if (article.categoryId) {
        trackInterest(userId, article.categoryId, 2).catch(() => {});
      }
    }
  }, [article, liked, userId, likeAnim]);

  const imageScale = scrollY.interpolate({
    inputRange: [-200, 0, heroHeight],
    outputRange: [1.6, 1, 1],
    extrapolate: "clamp",
  });
  const imageTranslate = scrollY.interpolate({
    inputRange: [0, heroHeight],
    outputRange: [0, -heroHeight / 2],
    extrapolate: "clamp",
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <ActivityIndicator color={Palette.red} size="large" />
      </View>
    );
  }

  if (error || !article) {
    return (
      <View style={styles.centered}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <Text style={{ color: Palette.textSecondary, marginBottom: 16 }}>{error ?? "Maqola topilmadi"}</Text>
        <Pressable onPress={() => router.back()} style={styles.listenBtn}>
          <Text style={styles.listenText}>Orqaga</Text>
        </Pressable>
      </View>
    );
  }

  const isPremiumLocked = article.tier !== "free" && !hasPremiumAccess;

  const articleContent = (
    <View style={[styles.pageContent, isDesktop && styles.pageContentDesktop]}>
      <Animated.View
        style={[
          styles.heroWrap,
          !isDesktop && styles.heroWrapMobile,
          isDesktop && styles.heroWrapDesktop,
          !isDesktop && { width, height: heroHeight },
          isDesktop && { height: heroHeight },
          { transform: [{ translateY: imageTranslate }, { scale: imageScale }] },
        ]}
      >
        <Image source={{ uri: article.cover }} style={styles.heroImage} contentFit="cover" />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.30)", "rgba(0,0,0,0.72)"]}
          locations={[0.4, 0.7, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <View
        style={[
          styles.body,
          isDesktop ? styles.bodyDesktop : styles.bodyMobile,
          {
            backgroundColor: colors.background,
            marginTop: isDesktop ? 0 : heroHeight - contentOverlap,
            borderTopLeftRadius: isDesktop ? 0 : contentRadius,
            borderTopRightRadius: isDesktop ? 0 : contentRadius,
          },
        ]}
      > 
        <View style={[styles.articleShell, isDesktop && styles.articleShellDesktop]}>
          {Platform.OS !== "web" && (
            <View style={styles.brandLogoWrap}>
              <RNImage source={brandLogo} style={styles.brandLogo} resizeMode="contain" />
            </View>
          )}

          <View style={styles.categoryRow}>
            <View style={styles.catChip}>
              <Text style={styles.catChipText}>{article.categoryName.toUpperCase()}</Text>
            </View>
            {article.tier !== "free" && (
              <View style={styles.tierChip}>
                <Crown size={12} color={Palette.white} />
                <Text style={styles.tierChipText}>{article.tier.toUpperCase()}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.title, { color: colors.text }, Platform.OS === "web" && !isDesktop && { fontSize: 22, lineHeight: 30 }]}>{article.title}</Text>
          {!!article.excerpt && (
            <Text style={[styles.excerpt, { color: colors.textSecondary }]}>{article.excerpt}</Text>
          )}

          <View style={[styles.authorRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.authorName, { color: colors.text }]}>{article.authorName}</Text>
              <Text style={styles.authorRole}>{relativeUz(article.publishedAt)}</Text>
            </View>
            <View style={{ gap: 4, alignItems: "flex-end" }}>
              {(article.viewCount ?? 0) > 0 && (
                <View style={styles.readTime}>
                  <Eye size={12} color={Palette.beige} />
                  <Text style={styles.readTimeText}>{formatViewCount(article.viewCount ?? 0)}</Text>
                </View>
              )}
              <View style={styles.readTime}>
                <Clock size={12} color={Palette.beige} />
                <Text style={styles.readTimeText}>{article.readMinutes} {t("article.readTime")}</Text>
              </View>
            </View>
          </View>

          {!!article.audio_url && (
            <Pressable onPress={onListen} style={styles.listenBtn}>
              <Headphones size={18} color={Palette.white} />
              <Text style={styles.listenText}>{t("article.listen")}</Text>
            </Pressable>
          )}

          {/* Font size controls */}
          <View style={styles.fontSizeRow}>
            <Pressable
              onPress={() => changeFontSize(-FONT_SIZE_STEP)}
              disabled={fontSize <= FONT_SIZE_MIN}
              style={[styles.fontSizeBtn, fontSize <= FONT_SIZE_MIN && { opacity: 0.38 }]}
            >
              <ZoomOut size={18} color={Palette.beige} />
            </Pressable>
            <Text style={styles.fontSizeLabel}>{fontSize}px</Text>
            <Pressable
              onPress={() => changeFontSize(FONT_SIZE_STEP)}
              disabled={fontSize >= FONT_SIZE_MAX}
              style={[styles.fontSizeBtn, fontSize >= FONT_SIZE_MAX && { opacity: 0.38 }]}
            >
              <ZoomIn size={18} color={Palette.beige} />
            </Pressable>
          </View>

          {/* ─── Article content with premium gate ─────────────────────────── */}
          <View style={{ marginTop: 24 }}>
            {isPremiumLocked ? (
              <View>
                <ArticleBlocks
                  blocks={blocks.slice(0, 2)}
                  fontSize={fontSize}
                  fallbackContent={
                    (localizeField(article as any, "content", language as any) ?? "")
                      .split(/\n\n+/)
                      .slice(0, 2)
                      .join("\n\n")
                  }
                  onPlayAudio={(audioUrl, caption) => {
                    const item = {
                      id: `block-${article.id}-audio`,
                      articleId: article.id,
                      title: caption || article.title,
                      author: article.authorName,
                      cover: article.cover,
                      durationSec: article.readMinutes * 60,
                      categoryId: article.categoryId,
                      audio_url: audioUrl,
                    };
                    play(item);
                    router.push("/player");
                  }}
                />
                <View style={[styles.premiumGate, { backgroundColor: colors.background }]}>
                  <LinearGradient
                    colors={["transparent", colors.background]}
                    locations={[0, 0.5]}
                    style={styles.premiumFade}
                    pointerEvents="none"
                  />
                  <View style={[styles.premiumGateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.premiumGateIcon}>
                      <Crown size={28} color={Palette.white} />
                    </View>
                    <Text style={[styles.premiumGateTitle, { color: colors.text }]}>
                      Premium kontent
                    </Text>
                    <Text style={[styles.premiumGateSub, { color: colors.textSecondary }]}>
                      {"Maqolaning to'liq matnini o'qish uchun obunani tanlang"}
                    </Text>
                    <Pressable
                      onPress={() => router.push("/subscribe")}
                      style={({ hovered }: any) => [
                        styles.premiumGateBtn,
                        hovered && { opacity: 0.88 },
                      ]}
                    >
                      <Text style={styles.premiumGateBtnText}>{"Premiumga obuna bo'lish"}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void onBuySingleArticle()}
                      style={({ hovered }: any) => [
                        styles.premiumGateBtnAlt,
                        { borderColor: colors.border, backgroundColor: hovered ? "#F5F0E8" : colors.card },
                      ]}
                      disabled={articlePaymentLoading}
                    >
                      {articlePaymentLoading ? (
                        <ActivityIndicator color={colors.text} />
                      ) : (
                        <Text style={[styles.premiumGateBtnAltText, { color: colors.text }]}> 
                          Faqat shu maqolani sotib oling
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <ArticleBlocks
                blocks={blocks}
                fontSize={fontSize}
                fallbackContent={localizeField(article as any, "content", language as any)}
                onPlayAudio={(audioUrl, caption) => {
                  const item = {
                    id: `block-${article.id}-audio`,
                    articleId: article.id,
                    title: caption || article.title,
                    author: article.authorName,
                    cover: article.cover,
                    durationSec: article.readMinutes * 60,
                    categoryId: article.categoryId,
                    audio_url: audioUrl,
                  };
                  play(item);
                  router.push("/player");
                }}
              />
            )}
          </View>

          {!!article.authorName && (
            <AuthorCard
              name={article.authorName}
              imageUrl={article.author_image_url ?? null}
              bio={localizeField(article as any, "author_bio", language as any) || null}
              label={t("article.author")}
            />
          )}

          <SocialEditorialBlock />

          {/* ─── Reaction bar (likes + comments count) ─────────────────────── */}
          <View style={[styles.reactionBar, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            <Pressable onPress={onToggleLike} style={styles.reactionBtn}>
              <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
                <Heart
                  size={22}
                  color={liked ? Palette.red : colors.textSecondary}
                  fill={liked ? Palette.red : "transparent"}
                />
              </Animated.View>
              {likesCount > 0 && (
                <Text style={[styles.reactionCount, { color: liked ? Palette.red : colors.textSecondary }]}>
                  {likesCount}
                </Text>
              )}
            </Pressable>
            <View style={styles.reactionBtn}>
              <MessageCircle size={22} color={colors.textSecondary} />
              {commentsCount > 0 && (
                <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>
                  {commentsCount}
                </Text>
              )}
            </View>
          </View>

          {/* ─── Comments section ─────────────────────────────────────────── */}
          <CommentsSection
            articleId={article.id}
            userId={userId}
            authorName={userDisplayName}
            commentsCount={commentsCount}
            isLoggedIn={!!user}
          />
        </View>
      </View>

      {related.length > 0 && (
        <View style={[styles.relatedSection, isDesktop && styles.relatedSectionDesktop]}>
          <SectionTitle
            kicker={article.issue_id ? "Shu sonda" : "O'xshash"}
            title={article.issue_id ? "Shu sondan bularni ham o'qing" : "Mavzuga doir"}
          />
          <View style={{ gap: 18, marginTop: 18 }}>
            {related.slice(0, 6).map((a) => (
              <ArticleCard key={a.id} article={a} variant="list" />
            ))}
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}> 
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <PremiumLockModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        onSubscribe={() => router.push("/subscribe")}
        onBuySingleArticle={() => void onBuySingleArticle()}
        buySingleLoading={articlePaymentLoading}
      />

      <PremiumBanner visible={isPremiumLocked} />

      {/* Floating back + action buttons */}
      <View style={[styles.topBar, { top: insets.top + 12 }]}> 
        <Pressable onPress={() => router.back()} style={styles.circleBtn} testID="back-btn">
          <ArrowLeft size={20} color={Palette.white} />
        </Pressable>
        {!isDesktop && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={onBookmark} style={styles.circleBtn}>
              <Bookmark size={18} color={Palette.white} fill={saved ? Palette.white : "transparent"} />
            </Pressable>
            <Pressable onPress={onShare} style={styles.circleBtn}>
              <Share2 size={18} color={Palette.white} />
            </Pressable>
          </View>
        )}
      </View>

      {isDesktop ? (
        /* ── Desktop: horizontal flex with sticky share sidebar ── */
        <View style={styles.desktopLayout}>
          {/* Sticky share sidebar */}
          <View style={styles.webShareBar}>
            <Pressable
              onPress={onBookmark}
              style={({ hovered }: any) => [
                styles.webShareBtn,
                {
                  backgroundColor: hovered ? (saved ? Palette.red : "#F5F0E8") : colors.card,
                  borderColor: saved ? Palette.red : colors.border,
                },
              ]}
            >
              <Bookmark
                size={18}
                color={saved ? Palette.red : colors.textSecondary}
                fill={saved ? Palette.red : "transparent"}
              />
            </Pressable>
            <Pressable
              onPress={onShare}
              style={({ hovered }: any) => [
                styles.webShareBtn,
                { backgroundColor: hovered ? "#F5F0E8" : colors.card, borderColor: colors.border },
              ]}
            >
              <Share2 size={18} color={colors.textSecondary} />
            </Pressable>
            {article.audio_url && (
              <Pressable
                onPress={onListen}
                style={({ hovered }: any) => [
                  styles.webShareBtn,
                  { backgroundColor: hovered ? Palette.red : colors.card, borderColor: hovered ? Palette.red : colors.border },
                ]}
              >
                {({ hovered }: any) => (
                  <Headphones size={18} color={hovered ? Palette.white : colors.textSecondary} />
                )}
              </Pressable>
            )}
            {/* Like button for desktop sidebar */}
            <View style={styles.webShareDivider} />
            <Pressable
              onPress={onToggleLike}
              style={({ hovered }: any) => [
                styles.webShareBtn,
                {
                  backgroundColor: liked
                    ? "rgba(237,28,36,0.08)"
                    : hovered
                    ? "#FFF0F0"
                    : colors.card,
                  borderColor: liked ? Palette.red : colors.border,
                },
              ]}
            >
              <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
                <Heart
                  size={18}
                  color={liked ? Palette.red : colors.textSecondary}
                  fill={liked ? Palette.red : "transparent"}
                />
              </Animated.View>
            </Pressable>
            {likesCount > 0 && (
              <Text style={[styles.webShareCount, { color: liked ? Palette.red : colors.textSecondary }]}>
                {likesCount}
              </Text>
            )}
          </View>

          {/* Main scrollable content */}
          <Animated.ScrollView
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: Platform.OS !== "web" }
            )}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            contentContainerStyle={[styles.scrollContainer, styles.scrollContainerDesktop, { paddingBottom: scrollBottomPadding }]}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1, alignSelf: "stretch", backgroundColor: colors.background }}
          >
            {articleContent}
          </Animated.ScrollView>

          {/* Right editorial recommendations sidebar */}
          <EditorialSidebar articles={recommendations} />
        </View>
      ) : (
        /* ── Mobile: standard ScrollView ── */
        <Animated.ScrollView
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: Platform.OS !== "web" }
          )}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          style={[styles.mobileScrollView, { backgroundColor: colors.background }]}
          contentContainerStyle={[styles.scrollContainer, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
        >
          {articleContent}
        </Animated.ScrollView>
      )}
    </View>
  );
}

/** Premium author profile card shown at the end of the article body. */
function AuthorCard({
  name,
  imageUrl,
  bio,
  label,
}: {
  name: string;
  imageUrl: string | null;
  bio: string | null;
  label: string;
}) {
  const colors = useColors();
  const AVATAR_SIZE = 68;
  return (
    <View style={authorStyles.card}>
      <View style={[authorStyles.topDivider, { backgroundColor: colors.border }]} />
      <Text style={authorStyles.sectionLabel}>{label}</Text>
      <View style={[authorStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={[authorStyles.avatar, { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }]}
            contentFit="cover"
          />
        ) : (
          <View style={[authorStyles.avatarPlaceholder, { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }]}>
            <Text style={authorStyles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={authorStyles.textWrap}>
          <Text style={[authorStyles.name, { color: colors.text }]}>{name}</Text>
          {!!bio && <Text style={[authorStyles.bio, { color: colors.textSecondary }]}>{bio}</Text>}
        </View>
      </View>
    </View>
  );
}

/** Right-side editorial recommendations sidebar — desktop/web only. */
function EditorialSidebar({ articles }: { articles: AppArticle[] }) {
  const colors = useColors();
  if (!articles.length) return null;

  return (
    <View
      style={sidebarStyles.container}
    >
      <Text style={[sidebarStyles.heading, { color: colors.text }]}>
        Tahririyat tavsiya qiladi
      </Text>
      <View style={sidebarStyles.list}>
        {articles.map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() =>
              router.push({ pathname: "/article/[id]", params: { id: item.id } })
            }
            style={({ hovered }: any) => [
              sidebarStyles.item,
              {
                borderTopColor: index === 0 ? "transparent" : "#f0f0f0",
                ...(hovered
                  ? {
                      backgroundColor: "#f7f7f7",
                      transform: [{ scale: 1.02 }],
                      ...Platform.select({ web: { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" } as any }),
                    }
                  : { backgroundColor: "transparent" }),
              },
            ]}
          >
            <Image
              source={{ uri: item.cover }}
              style={sidebarStyles.thumb}
              contentFit="cover"
            />
            <View style={sidebarStyles.itemBody}>
              <Text
                style={[sidebarStyles.itemTitle, { color: colors.text }]}
                numberOfLines={3}
              >
                {item.title}
              </Text>
              <View style={sidebarStyles.itemMeta}>
                {!!item.categoryName && (
                  <Text style={sidebarStyles.itemCat} numberOfLines={1}>
                    {item.categoryName}
                  </Text>
                )}
                {!!item.categoryName && (
                  <Text style={sidebarStyles.itemDot}>·</Text>
                )}
                <Text style={sidebarStyles.itemTime} numberOfLines={1}>
                  {relativeUz(item.publishedAt)}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    width: 320,
    padding: 16,
    borderRadius: 16,
    flexShrink: 0,
    marginTop: 32,
    marginRight: 24,
    marginLeft: 32,
    backgroundColor: "#ffffff",
    ...Platform.select({
      web: { boxShadow: "0 2px 20px rgba(0,0,0,0.08)" } as any,
    }),
  },
  heading: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#999999",
    marginBottom: 16,
  },
  list: {
    gap: 0,
    marginTop: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderRadius: 8,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transitionProperty: "transform, box-shadow, background-color",
        transitionDuration: "200ms",
      },
    }),
  },
  thumb: {
    width: 96,
    height: 72,
    borderRadius: 8,
    backgroundColor: "#E8E2D4",
    flexShrink: 0,
  },
  itemBody: {
    flex: 1,
    gap: 6,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    color: Palette.black,
  },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "nowrap",
  },
  itemCat: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  itemDot: {
    fontSize: 12,
    color: "#888888",
    flexShrink: 0,
  },
  itemTime: {
    fontSize: 12,
    color: "#888888",
    flexShrink: 1,
  },
});

const authorStyles = StyleSheet.create({
  card: {
    marginTop: 32,
    paddingTop: 24,
  },
  topDivider: {
    height: 1,
    backgroundColor: "#ECE6D8",
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: Palette.beige,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    backgroundColor: Palette.creamDeep,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  avatar: {
    backgroundColor: "#D8D1C3",
    flexShrink: 0,
  },
  avatarPlaceholder: {
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitial: {
    color: Palette.white,
    fontSize: 26,
    fontWeight: "800",
  },
  textWrap: {
    flex: 1,
    paddingTop: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.black,
    lineHeight: 22,
  },
  bio: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 20,
    marginTop: 6,
  },
});

/** Normalise type strings coming from the admin panel to canonical names. */
function canonicalType(raw: string): string {
  const t = (raw ?? "").toLowerCase().trim();
  if (t === "text" || t === "paragraph" || t === "body") return "paragraph";
  if (t === "heading" || t === "h1" || t === "h2" || t === "h3" || t === "h4") return "heading";
  if (t === "quote" || t === "blockquote" || t === "pullquote") return "quote";
  if (t === "image" || t === "photo" || t === "img") return "image";
  if (t === "audio" || t === "sound") return "audio";
  if (t === "video" || t === "youtube") return "video";
  if (t === "divider" || t === "separator" || t === "hr" || t === "rule") return "divider";
  return t;
}

/** Infer heading level from type string or block.level. */
function headingLevel(block: AppBlock): 1 | 2 | 3 {
  const raw = (block.type ?? "").toLowerCase();
  if (raw === "h1") return 1;
  if (raw === "h3" || raw === "h4") return 3;
  const l = block.level;
  if (l === 1) return 1;
  if (l === 3 || l === 4) return 3;
  return 2;
}

function ArticleBlocks({
  blocks,
  fallbackContent,
  fontSize,
  onPlayAudio,
}: {
  blocks: AppBlock[];
  fallbackContent?: string;
  fontSize?: number;
  onPlayAudio?: (audioUrl: string, caption?: string) => void;
}) {
  const colors = useColors();
  const bodyFontSize = fontSize ?? 18;
  if (!blocks.length) {
    if (!fallbackContent) return null;
    const paras = fallbackContent.split(/\n\n+/).filter((p) => p.trim());
    return (
      <View style={bStyles.root}>
        {paras.map((para, i) => (
          <Text key={i} style={[bStyles.paragraph, { color: colors.text, fontSize: bodyFontSize, lineHeight: bodyFontSize * 1.72 }]}>
            {para.trim()}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View style={bStyles.root}>
      {blocks.map((block) => {
        const type = canonicalType(block.type);

        // ── Paragraph ──────────────────────────────────────────────────────
        if (type === "paragraph") {
          const txt = block.text;
          if (!txt) return null;
          return (
            <Text key={block.id} style={[bStyles.paragraph, { color: colors.text, fontSize: bodyFontSize, lineHeight: bodyFontSize * 1.72 }]}>
              {txt}
            </Text>
          );
        }

        // ── Heading ────────────────────────────────────────────────────────
        if (type === "heading") {
          const txt = block.text;
          if (!txt) return null;
          const lv = headingLevel(block);
          return (
            <Text
              key={block.id}
              style={[
                bStyles.heading,
                lv === 1 && bStyles.headingH1,
                lv === 3 && bStyles.headingH3,
                { color: colors.text },
              ]}
            >
              {txt}
            </Text>
          );
        }

        // ── Quote ──────────────────────────────────────────────────────────
        if (type === "quote") {
          const text = block.quote || block.text;
          if (!text) return null;
          return (
            <View key={block.id} style={[bStyles.quote, { backgroundColor: colors.surface }]}>
              <Text style={bStyles.quoteMark}>&ldquo;</Text>
              <Text style={[bStyles.quoteText, { color: colors.text }]}>{text}</Text>
              {!!block.attribution && (
                <Text style={bStyles.quoteBy}>— {block.attribution}</Text>
              )}
            </View>
          );
        }

        // ── Image ──────────────────────────────────────────────────────────
        if (type === "image") {
          if (!block.media_url) return null;
          return (
            <View key={block.id} style={bStyles.imageBlock}>
              <Image
                source={{ uri: block.media_url }}
                style={bStyles.inlineImage}
                contentFit="cover"
              />
              {!!block.caption && (
                <Text style={bStyles.caption}>{block.caption}</Text>
              )}
            </View>
          );
        }

        // ── Audio ──────────────────────────────────────────────────────────
        if (type === "audio") {
          const audioUrl = block.media_url;
          if (!audioUrl) return null;
          return (
            <Pressable
              key={block.id}
              style={[bStyles.audioBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => onPlayAudio?.(audioUrl, block.caption || undefined)}
            >
              <View style={bStyles.audioIcon}>
                <Headphones size={22} color={Palette.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[bStyles.audioTitle, { color: colors.text }]} numberOfLines={2}>
                  {block.caption || "Audio tinglash"}
                </Text>
                <Text style={[bStyles.audioSub, { color: colors.textSecondary }]}>Bosing va eshiting</Text>
              </View>
              <Text style={bStyles.audioArrow}>▶</Text>
            </Pressable>
          );
        }

        // ── Video ──────────────────────────────────────────────────────────
        if (type === "video") {
          const ytId = extractYouTubeId(block.youtube_url);
          if (!ytId) return null;
          const thumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
          return (
            <Pressable
              key={block.id}
              style={bStyles.videoBlock}
              onPress={() =>
                router.push({
                  pathname: "/video-player",
                  params: {
                    videoId: ytId,
                    type: "long",
                    title: block.caption || "",
                    articleId: "",
                  },
                })
              }
            >
              <Image
                source={{ uri: thumb }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
              <View style={bStyles.videoOverlay} />
              <View style={bStyles.videoPlayBtn}>
                <Text style={{ color: Palette.white, fontSize: 26 }}>▶</Text>
              </View>
              {!!block.caption && (
                <Text style={bStyles.videoCaption}>{block.caption}</Text>
              )}
            </Pressable>
          );
        }

        // ── Divider ────────────────────────────────────────────────────────
        if (type === "divider") {
          return <View key={block.id} style={bStyles.divider} />;
        }

        // ── Unknown ────────────────────────────────────────────────────────
        if (__DEV__) {
          console.warn("[ArticleBlocks] unrecognized block type:", `"${block.type}"`, "id:", block.id);
        }
        // Still render text content so nothing is lost
        if (block.text) {
          return (
            <Text key={block.id} style={[bStyles.paragraph, { color: colors.text, fontSize: bodyFontSize, lineHeight: bodyFontSize * 1.72 }]}>
              {block.text}
            </Text>
          );
        }
        return null;
      })}
    </View>
  );
}

const bStyles = StyleSheet.create({
  root: { gap: 18 },

  // Paragraph
  paragraph: {
    color: Palette.black, // overridden inline with colors.text
    letterSpacing: 0.15,
    marginBottom: 18,
    ...Platform.select({
      web: { fontSize: 18, lineHeight: 32, maxWidth: 720 },
      default: { fontSize: 18, lineHeight: 30 },
    }),
  },

  // Headings
  heading: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black, // overridden inline with colors.text
    lineHeight: 30,
    marginTop: 6,
  },
  headingH1: { fontSize: 26, lineHeight: 34 },
  headingH3: { fontSize: 18, lineHeight: 26, fontWeight: "700" },

  // Quote
  quote: {
    backgroundColor: "#F5F0E8",
    borderLeftWidth: 4,
    borderLeftColor: Palette.red,
    borderRadius: 14,
    padding: 22,
    gap: 6,
  },
  quoteMark: {
    fontSize: 52,
    fontFamily: Fonts.serif,
    color: Palette.red,
    lineHeight: 44,
    marginBottom: -8,
  },
  quoteText: {
    fontSize: 18,
    fontFamily: Fonts.serif,
    fontStyle: "italic",
    color: Palette.black,
    lineHeight: 28,
  },
  quoteBy: {
    fontSize: 12,
    color: Palette.beige,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginTop: 4,
  },

  // Image
  imageBlock: { gap: 8 },
  inlineImage: {
    width: "100%",
    height: 260,
    borderRadius: 16,
    backgroundColor: "#EEE",
  },
  caption: {
    fontSize: 12,
    color: Palette.textSecondary,
    fontStyle: "italic",
    paddingHorizontal: 4,
  },

  // Audio block
  audioBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#F5F0E8",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(237,28,36,0.12)",
  },
  audioIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  audioTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Palette.black,
    lineHeight: 20,
  },
  audioSub: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
  audioArrow: { fontSize: 18, color: Palette.red, fontWeight: "700" },

  // Video block
  videoBlock: {
    height: 210,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Palette.black,
    alignItems: "center",
    justifyContent: "center",
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  videoPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  videoCaption: {
    position: "absolute",
    bottom: 12,
    left: 14,
    right: 14,
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontStyle: "italic",
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: "#ECE6D8",
    marginVertical: 6,
  },
});

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Palette.black },
  page: { flex: 1 },
  // ── Desktop layout ─────────────────────────────────────────────────────────
  desktopLayout: {
    flex: 1,
    flexDirection: "row",
    gap: 0,
  },
  webShareBar: {
    width: 88,
    paddingTop: 472,  // align with body content start (hero height + pageContentDesktop paddingTop)
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      web: { position: "sticky" as any, top: 80, alignSelf: "flex-start" },
    }),
  },
  webShareBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        transitionProperty: "background-color, border-color",
        transitionDuration: "150ms",
        cursor: "pointer",
      },
    }),
  },
  webShareDivider: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginVertical: 4,
    width: "100%",
  },
  webShareCount: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },
  // ── Reaction bar ───────────────────────────────────────────────────────────
  reactionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingVertical: 16,
    marginTop: 24,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  reactionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },
  reactionCount: {
    fontSize: 14,
    fontWeight: "600",
  },
  // ── Scroll containers ──────────────────────────────────────────────────────
  scrollContainer: {},
  scrollContainerDesktop: {},
  mobileScrollView: {
    flex: 1,
    ...Platform.select({ web: { paddingTop: 0 } }),
  },
  pageContent: { width: "100%" },
  pageContentDesktop: { width: "100%", maxWidth: 1160, alignSelf: "center", paddingTop: 32 },
  topBar: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  // ── Hero ───────────────────────────────────────────────────────────────────
  heroWrap: { width: "100%", backgroundColor: Palette.black, overflow: "hidden" },
  heroWrapMobile: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  heroWrapDesktop: { height: 480, borderRadius: 16, maxWidth: 1160, alignSelf: "center", overflow: "hidden", marginBottom: 24, width: "100%" },
  heroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroGrad: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.22)" },
  // ── Body ───────────────────────────────────────────────────────────────────
  body: {
    backgroundColor: Palette.cream,
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  bodyMobile: {
    position: "relative",
    zIndex: 2,
    overflow: "hidden",
    backgroundColor: Palette.cream,
    paddingTop: 12,
  },
  bodyDesktop: { paddingHorizontal: 32, paddingTop: 40 },
  articleShell: { width: "100%" },
  articleShellDesktop: { maxWidth: 820, alignSelf: "center" },
  brandLogoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  brandLogo: {
    width: 236,
    height: 44,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  // ── Article metadata ───────────────────────────────────────────────────────
  categoryRow: { flexDirection: "row", gap: 8 },
  catChip: { backgroundColor: Palette.red, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4 },
  catChipText: { color: Palette.white, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  tierChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Palette.black,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  tierChipText: { color: Palette.white, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  title: {
    fontFamily: Fonts.serif,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 16,
    ...Platform.select({
      web: { fontSize: 44, lineHeight: 54 },
      default: { fontSize: 28, lineHeight: 36 },
    }),
  },
  excerpt: {
    marginTop: 12,
    color: "#666666",
    ...Platform.select({
      web: { fontSize: 20, lineHeight: 30 },
      default: { fontSize: 15, lineHeight: 22 },
    }),
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  authorName: { fontWeight: "700", fontSize: 14 },
  authorRole: { color: Palette.textSecondary, fontSize: 12, marginTop: 2 },
  readTime: { flexDirection: "row", alignItems: "center", gap: 4 },
  readTimeText: { color: Palette.beige, fontSize: 12, fontWeight: "700" },
  listenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Palette.red,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignSelf: "flex-start",
  },
  listenText: { color: Palette.white, fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
  fontSizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: Palette.creamDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  fontSizeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },
  fontSizeLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Palette.beige,
    minWidth: 34,
    textAlign: "center",
  },
  contentDivider: { height: 1, backgroundColor: "#ECE6D8", marginVertical: 12 },
  relatedSection: { paddingHorizontal: 20, marginTop: 32 },
  relatedSectionDesktop: { maxWidth: 820, paddingHorizontal: 0, alignSelf: "center", marginBottom: 60 },
  // ── Premium gate ───────────────────────────────────────────────────────────
  premiumGate: {
    marginTop: -40,
    paddingTop: 80,
    paddingBottom: 40,
    alignItems: "center",
  },
  premiumFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    pointerEvents: "none",
  },
  premiumGateCard: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 24,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 12,
    ...Platform.select({
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.10)" },
    }),
  },
  premiumGateIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  premiumGateTitle: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 28,
  },
  premiumGateSub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 8,
  },
  premiumGateBtn: {
    width: "100%",
    backgroundColor: Palette.red,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    ...Platform.select({ web: { transitionProperty: "opacity", transitionDuration: "150ms" } }),
  },
  premiumGateBtnText: {
    color: Palette.white,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  premiumGateBtnAlt: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: "center",
    ...Platform.select({ web: { transitionProperty: "background-color", transitionDuration: "150ms" } }),
  },
  premiumGateBtnAltText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
