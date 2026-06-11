import { Image } from "expo-image";
import { ResizeMode, Video } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  ArrowRight,
  BookOpen,
  Eye,
  Play,
  Upload,
  Youtube,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { fetchMediaItems } from "@/lib/services";
import type { AppMediaItem } from "@/lib/types";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";

  function formatCount(value: number): string {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    }

    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    }

    return String(value);
  }

  function openReels(item: AppMediaItem) {
    router.push({
      pathname: "/reels",
      params: { initialVideoId: item.id },
    });
  }

  function openVideoPlayer(item: AppMediaItem) {
    router.push({
      pathname: "/video-player",
      params: {
        videoId: item.youtube_url ?? "",
        videoUrl: item.video_url ?? "",
        thumbnailUrl: item.thumbnail_url ?? item.cover,
        source: item.source,
        type: item.type,
        title: item.title,
        description: item.description,
        articleId: item.linked_article_id ?? "",
      },
    });
  }

  function openArticle(articleId: string | null | undefined) {
    if (articleId) {
      router.push(`/article/${articleId}` as any);
    }
  }

  function ShortCard({ item, width, allowPreview = false }: { item: AppMediaItem; width: number; allowPreview?: boolean }) {
    const [previewReady, setPreviewReady] = useState(false);
    const [previewFailed, setPreviewFailed] = useState(false);
    const previewImage = item.thumbnail_url || item.cover || null;
    const showVideoPreview = allowPreview && Boolean(item.video_url) && !previewFailed;

    return (
      <Pressable onPress={() => openReels(item)} style={[styles.shortCard, { width }]}>
        {showVideoPreview ? (
          <>
            {!!previewImage && !previewReady && (
              <Image
                source={{ uri: previewImage }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            )}
            <Video
              source={{ uri: item.video_url! }}
              style={StyleSheet.absoluteFillObject}
              shouldPlay={false}
              isMuted
              isLooping={false}
              useNativeControls={false}
              resizeMode={ResizeMode.COVER}
              onReadyForDisplay={() => setPreviewReady(true)}
              onError={() => setPreviewFailed(true)}
            />
          </>
        ) : previewImage ? (
          <Image
            source={{ uri: previewImage }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={["#1a1512", "#31221d", "#090909"]}
            locations={[0, 0.52, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.04)", "rgba(0,0,0,0.16)", "rgba(0,0,0,0.56)"]}
          locations={[0, 0.36, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.46)", "rgba(0,0,0,0.98)"]}
          locations={[0, 0.44, 1]}
          style={styles.shortBottomGradient}
          pointerEvents="none"
        />
        <View style={styles.shortBottom}>
          <Text style={styles.shortTitle} numberOfLines={4}>
            {item.title}
          </Text>
        </View>

        <View style={styles.shortViewsBadge}>
          <Eye size={11} color="rgba(255,255,255,0.86)" />
          <Text style={styles.shortViewsText}>{formatCount(item.views_count)}</Text>
        </View>
      </Pressable>
    );
  }

  function LongCard({ item, width }: { item: AppMediaItem; width: number }) {
    return (
      <View style={[styles.longCard, { width }]}> 
        <Pressable onPress={() => openVideoPlayer(item)} style={styles.longHero}>
          <Image source={{ uri: item.thumbnail_url || item.cover }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <LinearGradient
            colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.16)", "rgba(0,0,0,0.52)"]}
            locations={[0, 0.4, 1]}
            style={styles.longShade}
          />
          <View style={styles.longBadgeRow}>
            <View style={styles.sourceBadge}>
              {item.source === "youtube" ? (
                <Youtube size={12} color={Palette.white} />
              ) : (
                <Upload size={12} color={Palette.white} />
              )}
              <Text style={styles.sourceBadgeText}>{item.source === "youtube" ? "YouTube" : "Uploaded"}</Text>
            </View>
          </View>
          <View style={styles.longPlayButton}>
            <Play size={18} color={Palette.white} fill={Palette.white} />
          </View>
        </Pressable>

        <View style={styles.longMeta}>
          <Text style={styles.longTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {!!item.description && (
            <Text style={styles.longDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          <View style={styles.longStatsRow}>
            <View style={styles.longStatPill}>
              <Eye size={13} color={Palette.red} />
              <Text style={styles.longStatText}>{`${formatCount(item.views_count)} ko'rish`}</Text>
            </View>
          </View>

          <View style={styles.longActionRow}>
            <Pressable onPress={() => openVideoPlayer(item)} style={styles.watchButton}>
              <Text style={styles.watchButtonText}>Tomosha qilish</Text>
              <ArrowRight size={14} color={Palette.white} />
            </Pressable>
            {!!item.linked_article_id && (
              <Pressable onPress={() => openArticle(item.linked_article_id)} style={styles.linkedArticleButton}>
                <BookOpen size={14} color={Palette.red} />
                <Text style={styles.linkedArticleButtonText}>{"Maqolani o'qish"}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  function LoadingSkeleton({ shortWidth, shortHeight, isDesktop }: { shortWidth: number; shortHeight: number; isDesktop: boolean }) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}>
        <View style={styles.section}>
          <View style={styles.skeletonTitle} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
            {Array.from({ length: 5 }).map((_, index) => (
              <View key={`short-${index}`} style={[styles.skeletonCard, { width: shortWidth, height: shortHeight }]} />
            ))}
          </ScrollView>
        </View>
        <View style={styles.section}>
          <View style={styles.skeletonTitle} />
          <View style={styles.longList}>
            {Array.from({ length: 3 }).map((_, index) => (
              <View key={`long-${index}`} style={[styles.skeletonCard, styles.longSkeletonCard]} />
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  export default function MediaScreen() {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === "web" && width >= 1024;
    const { language } = useLanguage();
    const colors = useColors();
    const [shorts, setShorts] = useState<AppMediaItem[]>([]);
    const [longs, setLongs] = useState<AppMediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchMediaItems(language as any);
        if (data.error) {
          setError(data.error);
          setShorts([]);
          setLongs([]);
        } else {
          setShorts(data.shorts);
          setLongs(data.longs);
        }
      } catch (loadError: any) {
        setError(String(loadError?.message ?? loadError));
        setShorts([]);
        setLongs([]);
      } finally {
        setLoading(false);
      }
    }, [language]);

    useEffect(() => {
      void load();
    }, [load]);

    const contentWidth = useMemo(
      () => (isDesktop ? Math.min(1160, width) - 48 : width),
      [isDesktop, width]
    );

    const shortWidth = useMemo(() => {
      if (isDesktop) {
        if (shorts.length === 2) {
          return Math.min(260, Math.floor((contentWidth - 48 - 18) / 2));
        }

        return 198;
      }

      if (shorts.length === 2) {
        return Math.max(160, Math.min(186, Math.floor((contentWidth - 40 - 16) / 2)));
      }

      return Math.min(176, Math.max(158, Math.floor(contentWidth * 0.44)));
    }, [contentWidth, isDesktop, shorts.length]);

    const shortHeight = Math.round(shortWidth * (16 / 9));

    // Long videos: multi-column grid on web desktop
    const longCols = isDesktop ? (width >= 1200 ? 3 : 2) : 1;
    const longGap = 18;
    const longWidth = isDesktop
      ? Math.floor((contentWidth - 48 - longGap * (longCols - 1)) / longCols)
      : contentWidth - 40;

    const isEmpty = !loading && shorts.length === 0 && longs.length === 0;

    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.header, isDesktop && styles.headerDesktop]}>
            <Text style={styles.kicker}>MEDIA</Text>
            <Text style={[styles.title, { color: colors.text }]}>Videolar</Text>
          </View>

          {loading ? (
            <LoadingSkeleton shortWidth={shortWidth} shortHeight={shortHeight} isDesktop={isDesktop} />
          ) : error ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Media yuklanmadi</Text>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable onPress={load} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Qayta urinish</Text>
              </Pressable>
            </View>
          ) : isEmpty ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Videolar topilmadi</Text>
              <Text style={styles.stateText}>{"Admin paneldan media_videos yozuvlari chiqmaguncha bu bo'lim bo'sh ko'rinadi."}</Text>
            </View>
          ) : (
            <>
              {shorts.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Qisqa videolar</Text>
                    <Text style={styles.sectionCount}>{shorts.length} ta</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[
                      styles.carouselContent,
                      isDesktop && styles.carouselContentDesktop,
                      shorts.length <= 2 && styles.carouselContentBalanced,
                    ]}
                    decelerationRate="fast"
                    snapToInterval={shortWidth + 16}
                    snapToAlignment="start"
                  >
                    {shorts.map((item, index) => (
                      <ShortCard
                        key={item.id}
                        item={item}
                        width={shortWidth}
                        allowPreview={index < (isDesktop ? 3 : 2)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {longs.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Uzun videolar</Text>
                    <Text style={styles.sectionCount}>{longs.length} ta</Text>
                  </View>
                  <View style={[
                    styles.longList,
                    isDesktop && { flexDirection: "row", flexWrap: "wrap", gap: longGap, paddingHorizontal: 24, alignItems: "flex-start" },
                  ]}>
                    {longs.map((item) => (
                      <LongCard key={item.id} item={item} width={longWidth} />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

const styles = StyleSheet.create({
  content: {
    paddingBottom: 140,
  },
  contentDesktop: {
    maxWidth: 1160,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerDesktop: {
    marginTop: 16,
    paddingHorizontal: 24,
  },
  kicker: {
    color: Palette.beige,
    fontSize: 10,
    letterSpacing: 2.5,
    fontWeight: "800",
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    marginTop: 4,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "700",
    color: Palette.beige,
    letterSpacing: 0.5,
  },
  // Horizontal carousel
  carouselContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  carouselContentDesktop: {
    paddingHorizontal: 24,
  },
  carouselContentBalanced: {
    paddingRight: 20,
  },
  shortGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    alignItems: "flex-start",
    paddingHorizontal: 20,
  },
  shortCard: {
    aspectRatio: 9 / 16,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: Palette.black,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    elevation: 12,
  },
  shortBottom: {
    position: "absolute",
    bottom: 42,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingRight: 18,
  },
  shortBottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "64%",
  },
  shortTitle: {
    color: Palette.white,
    fontSize: 19,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    lineHeight: 23,
  },
  shortViewsBadge: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(11,13,17,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  shortViewsText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 10,
    fontWeight: "700",
  },
  longList: {
    gap: 18,
    paddingHorizontal: 20,
  },
  longCard: {
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "#fffaf6",
    borderWidth: 1,
    borderColor: "rgba(29,20,16,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 5,
    alignSelf: "center",
  },
  longHero: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: Palette.black,
  },
  longShade: {
    ...StyleSheet.absoluteFillObject,
  },
  longBadgeRow: {
    position: "absolute",
    top: 12,
    left: 12,
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(12,14,18,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sourceBadgeText: {
    color: Palette.white,
    fontSize: 11,
    fontWeight: "700",
  },
  longPlayButton: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -24,
    marginLeft: -24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(14,16,20,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  longMeta: {
    padding: 18,
    gap: 12,
  },
  longTitle: {
    fontSize: 19,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    lineHeight: 25,
  },
  longDescription: {
    color: Palette.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  longStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  longStatPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(237,28,36,0.08)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  longStatText: {
    color: Palette.red,
    fontSize: 12,
    fontWeight: "700",
  },
  longActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  watchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: Palette.red,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  watchButtonText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "700",
  },
  linkedArticleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: Palette.cream,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  linkedArticleButtonText: {
    color: Palette.red,
    fontSize: 13,
    fontWeight: "700",
  },
  stateCard: {
    backgroundColor: Palette.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 10,
  },
  stateTitle: {
    color: Palette.black,
    fontFamily: Fonts.serif,
    fontSize: 22,
    fontWeight: "800",
  },
  stateText: {
    color: Palette.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  retryButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: Palette.red,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  retryButtonText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "700",
  },
  skeletonTitle: {
    width: 170,
    height: 26,
    borderRadius: 10,
    backgroundColor: Palette.creamDeep,
    marginBottom: 14,
  },
  skeletonCard: {
    borderRadius: 22,
    backgroundColor: Palette.creamDeep,
  },
  longSkeletonCard: {
    alignSelf: "center",
    width: "100%",
    aspectRatio: 16 / 9,
    maxWidth: 860,
    minHeight: 320,
  },
});
