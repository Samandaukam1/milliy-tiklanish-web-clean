import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Bookmark, Clock, Crown } from "lucide-react-native";
import React, { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle, Platform, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import type { AppArticle } from "@/lib/types";
import { relativeUz } from "@/utils/date";
import { useApp } from "@/providers/AppProvider";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";

type Variant = "hero" | "large" | "compact" | "list" | "editorial" | "newspaper";

interface Props {
  article: AppArticle;
  variant?: Variant;
  rank?: number;
  containerStyle?: object;
  editorialMediaStyle?: StyleProp<ViewStyle>;
}

function ArticleCardComponent({ article, variant = "large", rank, containerStyle, editorialMediaStyle }: Props) {
  const categoryName = article.categoryName || "Umumiy";
  const authorName = article.authorName || "Tahririyat";
  const { isSaved, toggleSaved, markRead } = useApp();
  const { t } = useLanguage();
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const saved = isSaved(article.id);
  const [heroHovered, setHeroHovered] = useState(false);

  const open = useCallback(() => {
    markRead(article.id);
    router.push(`/article/${article.id}`);
  }, [article.id, markRead]);

  const onBookmark = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    toggleSaved(article.id);
  }, [article.id, toggleSaved]);

  if (variant === "hero") {
    return (
      <Pressable
        onPress={open}
        testID={`hero-${article.id}`}
        onHoverIn={() => Platform.OS === "web" && setHeroHovered(true)}
        onHoverOut={() => setHeroHovered(false)}
        style={[
          styles.hero,
          containerStyle,
          Platform.OS === "web" && heroHovered && { transform: [{ scale: 1.015 }] },
        ]}
      >
        <Image source={{ uri: article.cover }} style={styles.heroImage} contentFit="cover" />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.40)", "rgba(0,0,0,0.88)"]}
          locations={[0.2, 0.58, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View style={styles.categoryChipFilled}>
              <Text style={styles.categoryChipFilledText}>{categoryName.toUpperCase()}</Text>
            </View>
            {article.tier !== "free" && (
              <View style={styles.premiumBadge}>
                <Crown size={12} color={Palette.white} />
                <Text style={styles.premiumText}>{article.tier.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.heroTitle,
              Platform.OS === "web" && windowWidth < 1024 && { fontSize: 20, lineHeight: 27 },
            ]}
            numberOfLines={3}
          >
            {article.title}
          </Text>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaText}>{authorName}</Text>
            <View style={styles.dot} />
            <Clock size={12} color={Palette.white} />
            <Text style={styles.heroMetaText}>{article.readMinutes} {t("article.readTime")}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  if (variant === "compact") {
    return (
      <Pressable onPress={open} style={[styles.compact, containerStyle]} testID={`compact-${article.id}`}>
        {rank !== undefined && <Text style={styles.rank}>{String(rank).padStart(2, "0")}</Text>}
        <Image source={{ uri: article.cover }} style={styles.compactImage} contentFit="cover" />
        <View style={styles.compactBody}>
          <Text style={styles.categoryLabel}>{categoryName.toUpperCase()}</Text>
          <Text style={styles.compactTitle} numberOfLines={3}>
            {article.title}
          </Text>
          <Text style={styles.metaSmall}>
            {relativeUz(article.publishedAt)} · {article.readMinutes} {t("article.readTime")}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (variant === "editorial") {
    return (
      <Pressable onPress={open} testID={`editorial-${article.id}`}>
        {({ hovered }: any) => (
          <View style={[styles.editorial, containerStyle]}>
            <View style={[styles.editorialMedia, editorialMediaStyle]}>
              <Image
                source={{ uri: article.cover }}
                style={[styles.editorialImage, hovered && styles.editorialImageHovered]}
                contentFit="cover"
              />
              <LinearGradient
                colors={["rgba(0,0,0,0.04)", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.78)"]}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.editorialContent}>
                <Text style={styles.editorialKicker}>{categoryName.toUpperCase()}</Text>
                <Text style={styles.editorialTitle} numberOfLines={3}>
                  {article.title}
                </Text>
              </View>
            </View>
            <Text style={styles.editorialMeta}>
              {relativeUz(article.publishedAt)} · {article.readMinutes} {t("article.readTime")}
            </Text>
          </View>
        )}
      </Pressable>
    );
  }

  if (variant === "list") {
    return (
      <Pressable
        onPress={open}
        style={({ hovered }: any) => [
          styles.list,
          hovered && styles.listHovered,
          containerStyle,
        ]}
        testID={`list-${article.id}`}
      >
        <View style={styles.listBody}>
          <Text style={styles.categoryLabel}>{categoryName.toUpperCase()}</Text>
          <Text style={styles.listTitle} numberOfLines={3}>
            {article.title}
          </Text>
          <View style={styles.listMeta}>
            <Text style={styles.metaSmall}>{authorName}</Text>
            <View style={styles.dotBeige} />
            <Text style={styles.metaSmall}>{article.readMinutes} {t("article.readTimeFull")}</Text>
          </View>
        </View>
        <Image source={{ uri: article.cover }} style={styles.listImage} contentFit="cover" />
      </Pressable>
    );
  }

  if (variant === "newspaper") {
    return (
      <Pressable
        onPress={open}
        style={({ hovered }: any) => [
          styles.news,
          hovered && styles.newsHovered,
          containerStyle,
        ]}
        testID={`newspaper-${article.id}`}
      >
        <Image source={{ uri: article.cover }} style={styles.newsImage} contentFit="cover" />
        <View style={styles.newsBody}>
          <View style={styles.rowBetween}>
            <Text style={styles.categoryLabel}>{categoryName.toUpperCase()}</Text>
            {article.tier !== "free" && (
              <View style={styles.newsPremium}>
                <Crown size={11} color={Palette.gold} />
              </View>
            )}
          </View>
          <Text style={styles.newsTitle} numberOfLines={3}>
            {article.title}
          </Text>
          {!!article.excerpt && (
            <Text style={styles.newsExcerpt} numberOfLines={2}>
              {article.excerpt}
            </Text>
          )}
          <View style={styles.largeMeta}>
            <Text style={styles.metaSmall}>{authorName}</Text>
            <View style={styles.dotBeige} />
            <Text style={styles.metaSmall}>{relativeUz(article.publishedAt)}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={open}
      style={({ hovered }: any) => [
        styles.large,
        hovered && styles.largeHovered,
        containerStyle,
      ]}
      testID={`large-${article.id}`}
    >
      <Image source={{ uri: article.cover }} style={styles.largeImage} contentFit="cover" />
      <View style={styles.largeBody}>
        <View style={styles.rowBetween}>
          <Text style={styles.categoryLabel}>{categoryName.toUpperCase()}</Text>
          <Pressable hitSlop={10} onPress={onBookmark}>
            <Bookmark
              size={18}
              color={saved ? Palette.red : Palette.beige}
              fill={saved ? Palette.red : "transparent"}
            />
          </Pressable>
        </View>
        <Text style={styles.largeTitle} numberOfLines={3}>
          {article.title}
        </Text>
        <Text style={styles.excerpt} numberOfLines={2}>
          {article.excerpt}
        </Text>
        <View style={styles.largeMeta}>
          <Text style={styles.metaSmall}>{authorName}</Text>
          <View style={styles.dotBeige} />
          <Text style={styles.metaSmall}>{relativeUz(article.publishedAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export const ArticleCard = memo(ArticleCardComponent);

function createStyles(colors: ReturnType<typeof import("@/utils/useColors").useColors>) {
  return StyleSheet.create({
  hero: {
    ...Platform.select({
      web: {
        aspectRatio: 16 / 9,
        transition: "transform 300ms ease",
        cursor: "pointer",
        overflow: "hidden",
      },
      default: { height: 440 },
    }),
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: Palette.black,
  },
  heroImage: { ...StyleSheet.absoluteFillObject },
  // heroOverlay removed — replaced by LinearGradient
  heroContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 24,
    gap: 12,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  categoryChipFilled: {
    backgroundColor: Palette.red,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  categoryChipFilledText: {
    color: Palette.white,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  premiumText: { color: Palette.white, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  heroTitle: {
    color: Palette.white,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    letterSpacing: -0.3,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    ...Platform.select({
      web: { fontSize: 34, lineHeight: 43 },
      default: { fontSize: 26, lineHeight: 34 },
    }),
  },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroMetaText: { color: Palette.white, fontSize: 12, opacity: 0.9 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Palette.white, opacity: 0.7 },
  dotBeige: { width: 3, height: 3, borderRadius: 2, backgroundColor: Palette.beige },

  large: {
    backgroundColor: colors.card,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
        transitionProperty: "transform, box-shadow",
        transitionDuration: "200ms",
        cursor: "pointer",
      },
    }),
  },
  largeHovered: {
    ...Platform.select({
      web: {
        transform: [{ translateY: -3 }],
        boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
      },
    }),
  },
  largeImage: { width: "100%", aspectRatio: 16 / 9 },
  largeBody: { padding: 16, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  largeTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    color: colors.text,
  },
  excerpt: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  largeMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  avatarSm: { width: 22, height: 22, borderRadius: 11 },

  compact: { width: 240, gap: 10, marginRight: 16 },
  rank: {
    position: "absolute",
    top: -6,
    left: -6,
    color: Palette.red,
    fontSize: 36,
    fontWeight: "900",
    fontFamily: Fonts.serif,
    zIndex: 2,
    backgroundColor: colors.background,
    paddingHorizontal: 4,
  },
  compactImage: { width: "100%", height: 140, borderRadius: 10 },
  compactBody: { gap: 6 },
  compactTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    color: colors.text,
  },

  editorial: {
    gap: 10,
    ...Platform.select({
      web: {
        cursor: "pointer",
      },
    }),
  },
  editorialMedia: {
    position: "relative",
    width: "100%",
    aspectRatio: 9 / 16,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: Palette.black,
    ...Platform.select({
      web: {
        boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
        elevation: 6,
      },
    }),
  },
  editorialImage: {
    width: "100%",
    height: "100%",
    ...Platform.select({
      web: {
        transitionProperty: "transform",
        transitionDuration: "300ms",
        transitionTimingFunction: "ease",
      },
    }),
  },
  editorialImageHovered: {
    ...Platform.select({
      web: {
        transform: [{ scale: 1.05 }],
      },
    }),
  },
  editorialContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 40,
    gap: 6,
  },
  editorialKicker: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: "700",
  },
  editorialTitle: {
    color: Palette.white,
    fontSize: 20,
    lineHeight: 27,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.32)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  editorialMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
  },

  list: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...Platform.select({
      web: {
        transitionProperty: "box-shadow, transform",
        transitionDuration: "180ms",
        cursor: "pointer",
      },
    }),
  },
  listHovered: {
    ...Platform.select({
      web: {
        boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
        transform: [{ translateY: -2 }],
      },
    }),
  },
  listBody: { flex: 1, gap: 6 },
  listTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    color: colors.text,
    maxWidth: 420,
  },
  listMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  listImage: { width: 120, height: 120, borderRadius: 16 },
  news: {
    width: "100%",
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        transitionProperty: "box-shadow, transform",
        transitionDuration: "180ms",
        cursor: "pointer",
      },
    }),
  },
  newsHovered: {
    ...Platform.select({
      web: {
        boxShadow: "0 10px 28px rgba(0,0,0,0.12)",
        transform: [{ translateY: -2 }],
      },
    }),
  },
  newsImage: { width: "100%", aspectRatio: 16 / 9 },
  newsBody: { padding: 15, gap: 7 },
  newsTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    color: colors.text,
  },
  newsExcerpt: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  newsPremium: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(196, 154, 65, 0.1)",
    flexShrink: 0,
  },
  categoryLabel: { color: Palette.beige, fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  metaSmall: { color: colors.textSecondary, fontSize: 11 },
  });
}
