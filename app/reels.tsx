import { BlurView } from "expo-blur";
import { ResizeMode } from "expo-av";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Eye,
  EyeOff,
  Heart,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Pause,
  Play,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
  ViewToken,
} from "react-native";
import brandLogo from "../assets/images/milliy-tiklanish-logo.png";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MediaCommentsSheet } from "@/components/MediaCommentsSheet";
import { UploadedVideoPlayer, type UploadedVideoPlayerHandle } from "@/components/UploadedVideoPlayer";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import {
  fetchMediaItems,
  fetchUserLikedMediaVideoIds,
  preloadMediaNeighbors,
  recordMediaVideoShare,
  recordMediaVideoView,
  setMediaVideoLike,
} from "@/lib/services";
import type { AppMediaItem } from "@/lib/types";
import { useApp } from "@/providers/AppProvider";
import { useLanguage } from "@/providers/LanguageProvider";

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return String(value);
}

function resolveReelArticleId(
  item: AppMediaItem & { article?: { id?: string | number | null } | null }
): string | number | null {
  return item.article_id ?? item.articles?.id ?? item.article?.id ?? item.linked_article_id ?? item.linkedArticle?.id ?? null;
}

const WEB_DESKTOP_BREAKPOINT = 1024;
const WEB_REELS_VIEWER_ID = "web-reels-viewer";

function resolveReelShareUrl(item: AppMediaItem): string | undefined {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/reels?initialVideoId=${encodeURIComponent(item.id)}`;
  }

  return item.video_url || item.youtube_url || undefined;
}

type GlassSurfaceProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
};

function GlassSurface({ children, style, intensity = 42 }: GlassSurfaceProps) {
  return (
    <BlurView
      tint="dark"
      intensity={intensity}
      experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
      style={[styles.glassSurface, style]}
    >
      {children}
    </BlurView>
  );
}

type ReelActionButtonProps = {
  icon: React.ReactNode;
  count?: string;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  variant?: "mobile" | "desktop";
  onPress: () => void;
};

function ReelActionButton({
  icon,
  count,
  label,
  active = false,
  disabled = false,
  variant = "mobile",
  onPress,
}: ReelActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ hovered, pressed }: any) => [
        styles.actionItem,
        variant === "desktop" && styles.desktopActionItem,
        disabled && styles.actionItemDisabled,
        hovered && !disabled && variant === "desktop" && styles.desktopActionItemHovered,
        pressed && !disabled && styles.actionItemPressed,
      ]}
    >
      <GlassSurface
        style={[
          styles.actionIconWrap,
          variant === "desktop" && styles.desktopActionIconWrap,
          active && styles.actionIconWrapActive,
        ]}
        intensity={variant === "desktop" ? 56 : 48}
      >
        {icon}
      </GlassSurface>
      {!!(count || label) && (
        <Text style={[styles.actionLabel, variant === "desktop" && styles.desktopActionLabel, active && styles.actionLabelActive]}>
          {count ?? label}
        </Text>
      )}
    </Pressable>
  );
}

type ReelSlideProps = {
  item: AppMediaItem;
  isActive: boolean;
  shouldLoad: boolean;
  isLiked: boolean;
  isSaved: boolean;
  muted: boolean;
  width: number;
  height: number;
  topInset: number;
  insetsBottom: number;
  onLike: () => void;
  onDoubleTapLike: () => void;
  onComments: () => void;
  onShare: () => void;
  onSave: () => void;
  onOpenArticle: () => void;
  onToggleMuted: () => void;
  cleanMode: boolean;
  overlayOpacity: Animated.Value;
  onToggleCleanMode: () => void;
  onPlaybackHandleChange?: (player: UploadedVideoPlayerHandle | null) => void;
};

function ReelSlide({
  item,
  isActive,
  shouldLoad,
  isLiked,
  isSaved,
  muted,
  width,
  height,
  topInset,
  insetsBottom,
  onLike,
  onDoubleTapLike,
  onComments,
  onShare,
  onSave,
  onOpenArticle,
  onToggleMuted,
  cleanMode,
  overlayOpacity,
  onToggleCleanMode,
  onPlaybackHandleChange,
}: ReelSlideProps) {
  const videoRef = useRef<UploadedVideoPlayerHandle | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeedHolding, setIsSpeedHolding] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"play" | "pause" | "heart" | null>(null);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const ignoreNextPressRef = useRef(false);
  const feedbackProgress = useRef(new Animated.Value(0)).current;

  const clearPendingTap = useCallback(() => {
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
    }
  }, []);

  const showFeedback = useCallback(
    (type: "play" | "pause" | "heart") => {
      setFeedbackType(type);
      feedbackProgress.stopAnimation();
      feedbackProgress.setValue(0);

      Animated.sequence([
        Animated.timing(feedbackProgress, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.delay(type === "heart" ? 280 : 180),
        Animated.timing(feedbackProgress, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setFeedbackType(null);
        }
      });
    },
    [feedbackProgress]
  );

  const handleSingleTap = useCallback(() => {
    if (!isActive || !item.video_url) {
      return;
    }

    setIsPaused((current) => {
      const nextPaused = !current;
      showFeedback(nextPaused ? "pause" : "play");
      return nextPaused;
    });
  }, [isActive, item.video_url, showFeedback]);

  const handleDoubleTap = useCallback(() => {
    if (!isActive) {
      return;
    }

    showFeedback("heart");
    onDoubleTapLike();
  }, [isActive, onDoubleTapLike, showFeedback]);

  const handleStagePress = useCallback(() => {
    if (!isActive) {
      return;
    }

    if (ignoreNextPressRef.current) {
      ignoreNextPressRef.current = false;
      return;
    }

    const now = Date.now();
    if (now - lastTapRef.current < 260) {
      clearPendingTap();
      lastTapRef.current = 0;
      handleDoubleTap();
      return;
    }

    lastTapRef.current = now;
    clearPendingTap();
    tapTimeoutRef.current = setTimeout(() => {
      tapTimeoutRef.current = null;
      handleSingleTap();
    }, 260);
  }, [clearPendingTap, handleDoubleTap, handleSingleTap, isActive]);

  const handleHoldStart = useCallback(() => {
    if (!isActive || !item.video_url) {
      return;
    }

    ignoreNextPressRef.current = true;
    setIsSpeedHolding(true);
  }, [isActive, item.video_url]);

  const handleHoldEnd = useCallback(() => {
    if (!isSpeedHolding) {
      return;
    }

    setIsSpeedHolding(false);
  }, [isSpeedHolding]);

  useEffect(() => {
    return () => {
      clearPendingTap();
      const player = videoRef.current;
      if (player) {
        void player.pauseAsync().catch(() => {});
        void player.unloadAsync().catch(() => {});
      }
    };
  }, [clearPendingTap]);

  useEffect(() => {
    if (isActive) {
      onPlaybackHandleChange?.(videoRef.current);
      return;
    }

    onPlaybackHandleChange?.(null);
    clearPendingTap();
    lastTapRef.current = 0;
    ignoreNextPressRef.current = false;
    setIsPaused(false);
    setIsSpeedHolding(false);
    setIsDescriptionExpanded(false);
    feedbackProgress.stopAnimation();
    feedbackProgress.setValue(0);
    setFeedbackType(null);
  }, [clearPendingTap, feedbackProgress, isActive, onPlaybackHandleChange]);

  const setVideoHandle = useCallback(
    (player: UploadedVideoPlayerHandle | null) => {
      videoRef.current = player;
      if (isActive) {
        onPlaybackHandleChange?.(player);
      }
    },
    [isActive, onPlaybackHandleChange]
  );

  const feedbackScale = feedbackProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });

  const shouldPlay = isActive && !isPaused;
  const embeddedArticle = item.articles ?? null;
  const resolvedArticleId = resolveReelArticleId(item as AppMediaItem & { article?: { id?: string | number | null } | null });
  const isDesktopWeb = Platform.OS === "web" && width >= WEB_DESKTOP_BREAKPOINT;
  const linkedArticleTitle =
    embeddedArticle?.title_uz?.trim() ||
    item.linkedArticle?.title?.trim() ||
    "Maqolani o'qish";
  const linkedArticleCover =
    embeddedArticle?.featured_image_url?.trim() ||
    item.linkedArticle?.cover?.trim() ||
    null;
  const hasLinkedArticle = Boolean(resolvedArticleId || embeddedArticle || item.linkedArticle);
  const reelItemWithSaveCounts = item as AppMediaItem & {
    saves_count?: number | null;
    save_count?: number | null;
    saved_count?: number | null;
  };
  const rawSaveCount =
    reelItemWithSaveCounts.saves_count ??
    reelItemWithSaveCounts.save_count ??
    reelItemWithSaveCounts.saved_count ??
    0;
  const likeCount = formatCount(item.likes_count ?? 0);
  const commentCount = formatCount(item.comments_count ?? 0);
  const shareCount = formatCount(item.shares_count ?? 0);
  const viewCount = formatCount(item.views_count ?? 0);
  const saveCount = formatCount(rawSaveCount);
  const canExpandDescription = item.description.trim().length > 90;
  // Desktop: max 86vh, true 9:16 aspect ratio
  const preferredStageHeight = Math.min(height * 0.86, 820);
  const stageWidth = Math.min(preferredStageHeight * (9 / 16), 420);
  const stageHeight = stageWidth * (16 / 9);
  const overlayTranslateY = overlayOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });
  const overlayTranslateX = overlayOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  useEffect(() => {
    console.log("[reels] item article_id", item.id, item.article_id ?? item.linked_article_id ?? null, item.articles ?? null);
  }, [item.article_id, item.articles, item.id, item.linked_article_id]);

  const handleOpenArticle = useCallback(async () => {
    setIsPaused(true);
    setIsSpeedHolding(false);
    const player = videoRef.current;
    if (player) {
      await player.pauseAsync().catch(() => {});
    }
    onOpenArticle();
  }, [onOpenArticle]);

  if (isDesktopWeb) {
    return (
      <View style={[styles.slide, styles.desktopSlide, { width, height }]}>
        {/* Blurred ambient background */}
        <View style={styles.desktopBackdrop} pointerEvents="none">
          <Image
            source={{ uri: item.thumbnail_url || item.cover }}
            style={styles.desktopBackdropImage}
            contentFit="cover"
            blurRadius={64}
          />
          <View style={styles.desktopBackdropTint} />
          <LinearGradient
            colors={["rgba(0,0,0,0.95)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.97)"]}
            locations={[0, 0.44, 1]}
            style={styles.desktopBackdropVerticalVignette}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.98)", "rgba(0,0,0,0.38)", "rgba(0,0,0,0.98)"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.desktopBackdropHorizontalVignette}
          />
        </View>

        <View style={styles.desktopShell}>
          <View style={styles.desktopViewerRow}>

            {/* ── LEFT INFO COLUMN ─────────────────────────────────── */}
            <Animated.View
              style={[
                styles.desktopInfoColumn,
                { opacity: cleanMode ? 0 : overlayOpacity },
              ]}
              pointerEvents={cleanMode ? "none" : "box-none"}
            >
              {hasLinkedArticle && (
                <Pressable
                  onPress={() => void handleOpenArticle()}
                  hitSlop={8}
                  style={[styles.articleCardPressable, { maxWidth: 320 }]}
                >
                  <GlassSurface style={styles.articleCard} intensity={58}>
                    {!!linkedArticleCover && (
                      <Image
                        source={{ uri: linkedArticleCover }}
                        style={styles.articleCover}
                        contentFit="cover"
                      />
                    )}
                    <View style={styles.articleMeta}>
                      <Text style={styles.articleLabel}>Biriktirilgan maqola</Text>
                      <Text style={styles.articleTitle} numberOfLines={2}>
                        {linkedArticleTitle}
                      </Text>
                    </View>
                    <View style={styles.articleArrowWrap}>
                      <ArrowUpRight size={15} color={Palette.red} strokeWidth={2.2} />
                    </View>
                  </GlassSurface>
                </Pressable>
              )}

              {!!item.title && (
                <Text style={styles.desktopInfoTitle} numberOfLines={4}>
                  {item.title}
                </Text>
              )}

              {!!item.description && (
                <Pressable
                  onPress={() => setIsDescriptionExpanded((c) => !c)}
                  style={styles.descriptionPressable}
                >
                  <Text style={styles.reelDescription} numberOfLines={isDescriptionExpanded ? undefined : 3}>
                    {item.description}
                  </Text>
                  {canExpandDescription && (
                    <Text style={styles.descriptionToggle}>
                      {isDescriptionExpanded ? "yopish" : "ko'proq"}
                    </Text>
                  )}
                </Pressable>
              )}

              <View style={styles.metaRow}>
                <GlassSurface style={styles.metaPill} intensity={44}>
                  <Eye size={13} color={Palette.white} />
                  <Text style={styles.metaText}>{`${viewCount} ko'rish`}</Text>
                </GlassSurface>
              </View>
            </Animated.View>

            {/* ── CENTER VIDEO CARD ──────────────────────────────── */}
            <View style={[styles.desktopStageShell, { width: stageWidth, height: stageHeight }]}>
              <View style={styles.desktopStageGlow} pointerEvents="none" />
              <View style={styles.desktopVideoFrame}>
                {shouldLoad && item.video_url ? (
                  <UploadedVideoPlayer
                    ref={setVideoHandle}
                    uri={item.video_url}
                    posterUri={item.thumbnail_url || item.cover}
                    shouldPlay={shouldPlay}
                    isLooping
                    isMuted={muted}
                    playbackRate={isSpeedHolding ? 2 : 1}
                    resizeMode={ResizeMode.CONTAIN}
                    webUseContainedMedia
                    style={styles.desktopVideoMedia}
                  />
                ) : (
                  <Image
                    source={{ uri: item.thumbnail_url || item.cover }}
                    style={styles.desktopVideoMedia}
                    contentFit="contain"
                  />
                )}

                {/* Tap to play/pause */}
                <Pressable
                  onPress={handleStagePress}
                  onLongPress={handleHoldStart}
                  onPressOut={handleHoldEnd}
                  delayLongPress={220}
                  style={StyleSheet.absoluteFillObject}
                />

                {isSpeedHolding && (
                  <View style={styles.speedIndicatorWrap} pointerEvents="none">
                    <GlassSurface style={styles.speedIndicator} intensity={50}>
                      <Text style={styles.speedIndicatorText}>2x</Text>
                    </GlassSurface>
                  </View>
                )}

                {feedbackType && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.feedbackWrap,
                      {
                        opacity: feedbackProgress,
                        transform: [{ scale: feedbackScale }],
                      },
                    ]}
                  >
                    {feedbackType === "heart" ? (
                      <Heart size={92} color={Palette.red} fill={Palette.red} />
                    ) : (
                      <GlassSurface style={styles.feedbackBubble} intensity={56}>
                        {feedbackType === "pause" ? (
                          <Pause size={38} color={Palette.white} strokeWidth={2.4} />
                        ) : (
                          <Play size={38} color={Palette.white} fill={Palette.white} strokeWidth={2.4} />
                        )}
                      </GlassSurface>
                    )}
                  </Animated.View>
                )}
              </View>
            </View>

            {/* ── RIGHT ACTION RAIL ────────────────────────────────── */}
            <Animated.View
              style={[
                styles.desktopActionRail,
                {
                  opacity: overlayOpacity,
                  transform: [{ translateX: overlayTranslateX }],
                },
              ]}
            >
                <ReelActionButton
                  icon={<Heart size={24} color={isLiked ? Palette.red : Palette.white} fill={isLiked ? Palette.red : "transparent"} />}
                  count={likeCount}
                  active={isLiked}
                  variant="desktop"
                  onPress={onLike}
                />
                <ReelActionButton
                  icon={<MessageCircle size={24} color={Palette.white} />}
                  count={commentCount}
                  variant="desktop"
                  onPress={onComments}
                />
                <ReelActionButton
                  icon={<Share2 size={24} color={Palette.white} />}
                  count={shareCount}
                  variant="desktop"
                  onPress={onShare}
                />
                <ReelActionButton
                  icon={<Bookmark size={23} color={isSaved ? Palette.red : Palette.white} fill={isSaved ? Palette.red : "transparent"} />}
                  label={isSaved ? "Saved" : "Save"}
                  active={isSaved}
                  variant="desktop"
                  disabled={!resolvedArticleId}
                  onPress={onSave}
                />
                <ReelActionButton
                  icon={cleanMode ? <Eye size={22} color={Palette.white} /> : <EyeOff size={22} color={Palette.white} />}
                  label={cleanMode ? "Overlay" : "Clean"}
                  variant="desktop"
                  onPress={onToggleCleanMode}
                />
            </Animated.View>

            {/* Desktop clean-mode restore — visible when action rail is hidden */}
            {cleanMode && (
              <View style={styles.desktopCleanRestore}>
                <Pressable onPress={onToggleCleanMode} hitSlop={10} style={styles.desktopCleanRestoreBtn}>
                  <GlassSurface style={styles.cleanModeRestoreSurface} intensity={46}>
                    <Eye size={20} color={Palette.white} />
                  </GlassSurface>
                </Pressable>
              </View>
            )}

          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.slide, { width, height }]}> 
      <View style={[styles.stage, { width, height }]}> 
        {shouldLoad && item.video_url ? (
          <UploadedVideoPlayer
            ref={setVideoHandle}
            uri={item.video_url}
            posterUri={item.thumbnail_url || item.cover}
            shouldPlay={shouldPlay}
            isLooping
            isMuted={muted}
            playbackRate={isSpeedHolding ? 2 : 1}
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <Image
            source={{ uri: item.thumbnail_url || item.cover }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
        )}

        {!cleanMode && (
          <>
            <Animated.View pointerEvents="none" style={[styles.chromeFadeLayer, { opacity: overlayOpacity }]}> 
              <LinearGradient
                colors={["rgba(0,0,0,0.68)", "rgba(0,0,0,0.2)", "transparent"]}
                locations={[0, 0.42, 1]}
                style={styles.stageShadeTop}
                pointerEvents="none"
              />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.chromeFadeLayer, { opacity: overlayOpacity }]}> 
              <LinearGradient
                 colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]}
                 locations={[0, 0.5, 1]}
                 style={[styles.stageShadeBottom, { height: height * 0.55 }]}
                pointerEvents="none"
              />
            </Animated.View>
          </>
        )}

        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable
            onPress={handleStagePress}
            onLongPress={handleHoldStart}
            onPressOut={handleHoldEnd}
            delayLongPress={220}
            style={[
              styles.centerGestureZone,
              { top: topInset + 72, bottom: insetsBottom + 336 },
            ]}
          />
          <Pressable
            onLongPress={handleHoldStart}
            onPressOut={handleHoldEnd}
            delayLongPress={220}
            style={[
              styles.rightGestureZone,
              { top: topInset + 78, bottom: insetsBottom + 332 },
            ]}
          />
        </View>

        {isSpeedHolding && (
          <View style={styles.speedIndicatorWrap} pointerEvents="none">
            <GlassSurface style={styles.speedIndicator} intensity={50}>
              <Text style={styles.speedIndicatorText}>2x</Text>
            </GlassSurface>
          </View>
        )}

        {feedbackType && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.feedbackWrap,
              {
                opacity: feedbackProgress,
                transform: [{ scale: feedbackScale }],
              },
            ]}
          >
            {feedbackType === "heart" ? (
              <Heart size={92} color={Palette.red} fill={Palette.red} />
            ) : (
              <GlassSurface style={styles.feedbackBubble} intensity={56}>
                {feedbackType === "pause" ? (
                  <Pause size={38} color={Palette.white} strokeWidth={2.4} />
                ) : (
                  <Play size={38} color={Palette.white} fill={Palette.white} strokeWidth={2.4} />
                )}
              </GlassSurface>
            )}
          </Animated.View>
        )}

        {!cleanMode && (
          <>
            <Animated.View style={[styles.actionRail, { bottom: insetsBottom + 40, opacity: overlayOpacity }]}> 
              <ReelActionButton
                icon={<Heart size={25} color={isLiked ? Palette.red : Palette.white} fill={isLiked ? Palette.red : "transparent"} />}
                count={likeCount}
                active={isLiked}
                onPress={onLike}
              />
              <ReelActionButton
                icon={<MessageCircle size={25} color={Palette.white} />}
                count={commentCount}
                onPress={onComments}
              />
              <ReelActionButton
                icon={<Share2 size={25} color={Palette.white} />}
                count={shareCount}
                onPress={onShare}
              />
              <ReelActionButton
                icon={<Bookmark size={25} color={isSaved ? Palette.red : Palette.white} fill={isSaved ? Palette.red : "transparent"} />}
                count={saveCount}
                active={isSaved}
                disabled={!resolvedArticleId}
                onPress={onSave}
              />
              <ReelActionButton
                icon={<EyeOff size={24} color={Palette.white} />}
                onPress={onToggleCleanMode}
              />
            </Animated.View>

            <Animated.View style={[styles.bottomOverlay, { paddingBottom: insetsBottom + 24, opacity: overlayOpacity }]} pointerEvents="box-none"> 

              {hasLinkedArticle && (
                <Pressable onPress={() => void handleOpenArticle()} hitSlop={10} style={styles.articleCardPressable}>
                  <GlassSurface style={styles.articleCard} intensity={58}>
                    {!!linkedArticleCover && (
                      <Image
                        source={{ uri: linkedArticleCover }}
                        style={styles.articleCover}
                        contentFit="cover"
                      />
                    )}
                    <View style={styles.articleMeta}>
                      <Text style={styles.articleLabel}>Biriktirilgan maqola</Text>
                      <Text style={styles.articleTitle} numberOfLines={2}>
                        {linkedArticleTitle}
                      </Text>
                    </View>
                    <View style={styles.articleArrowWrap}>
                      <ArrowUpRight size={15} color={Palette.red} strokeWidth={2.2} />
                    </View>
                  </GlassSurface>
                </Pressable>
              )}

              {!!item.title && (
                <Text style={styles.reelTitle} numberOfLines={4}>
                  {item.title}
                </Text>
              )}

              {!!item.description && (
                <Pressable onPress={() => setIsDescriptionExpanded((current) => !current)} style={styles.descriptionPressable}>
                  <Text style={styles.reelDescription} numberOfLines={isDescriptionExpanded ? undefined : 2}>
                    {item.description}
                  </Text>
                  {canExpandDescription && (
                    <Text style={styles.descriptionToggle}>
                      {isDescriptionExpanded ? "yopish" : "ko'proq"}
                    </Text>
                  )}
                </Pressable>
              )}

              <View style={styles.metaRow}>
                <GlassSurface style={styles.metaPill} intensity={44}>
                  <Eye size={13} color={Palette.white} />
                  <Text style={styles.metaText}>{`${viewCount} ko'rish`}</Text>
                </GlassSurface>
              </View>
            </Animated.View>
          </>
        )}

        {cleanMode && (
          <View style={[styles.cleanModeRestoreWrap, { bottom: insetsBottom + 28 }]}> 
            <Pressable onPress={onToggleCleanMode} hitSlop={10} style={styles.cleanModeRestorePressable}>
              <GlassSurface style={styles.cleanModeRestoreSurface} intensity={46}>
                <Eye size={20} color={Palette.white} />
              </GlassSurface>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export default function ReelsScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { initialVideoId } = useLocalSearchParams<{ initialVideoId?: string }>();
  const { language } = useLanguage();
  const { user, deviceUserId, isSaved, toggleSaved } = useApp();
  const viewerId = user?.id ?? deviceUserId;
  const authorName = user?.full_name || user?.name || user?.login || "Foydalanuvchi";
  const isDesktopWeb = Platform.OS === "web" && screenWidth >= WEB_DESKTOP_BREAKPOINT;
  // Mobile web: phone-frame sizing; desktop: full screen (3-column layout fills the viewport)
  const viewerWidth = screenWidth;
  const viewerHeight = screenHeight;
  const viewerTopInset = isDesktopWeb ? 0 : insets.top;
  const viewerBottomInset = isDesktopWeb ? 0 : insets.bottom;

  const [videos, setVideos] = useState<AppMediaItem[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(Platform.OS === "web");
  const [commentsTargetId, setCommentsTargetId] = useState<string | null>(null);
  const [cleanMode, setCleanMode] = useState(false);
  const [isLeavingScreen, setIsLeavingScreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const listRef = useRef<FlatList<AppMediaItem>>(null);
  const activePlayerRef = useRef<UploadedVideoPlayerHandle | null>(null);
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const initialIndex = useMemo(() => {
    const foundIndex = videos.findIndex((video) => video.id === initialVideoId);
    return foundIndex >= 0 ? foundIndex : 0;
  }, [initialVideoId, videos]);

  const updateVideo = useCallback((videoId: string, updater: (video: AppMediaItem) => AppMediaItem) => {
    setVideos((prev) => prev.map((video) => (video.id === videoId ? updater(video) : video)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchMediaItems(language as any);
      if (data.error) {
        setError(data.error);
        setVideos([]);
        setLikedIds(new Set());
        return;
      }

      const nextVideos = data.shorts;
      setVideos(nextVideos);

      const startIndex = nextVideos.findIndex((video) => video.id === initialVideoId);
      setActiveIndex(startIndex >= 0 ? startIndex : 0);

      if (viewerId) {
        const nextLikedIds = await fetchUserLikedMediaVideoIds(
          nextVideos.map((video) => video.id),
          viewerId
        );
        setLikedIds(nextLikedIds);
      } else {
        setLikedIds(new Set());
      }
    } catch (loadError: any) {
      setError(String(loadError?.message ?? loadError));
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [initialVideoId, language, viewerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (videos.length === 0) {
      return;
    }

    listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
  }, [initialIndex, videos.length]);

  const activeVideoId = videos[activeIndex]?.id;
  const activeVideo = videos[activeIndex] ?? null;
  const activeArticleId = activeVideo
    ? resolveReelArticleId(activeVideo as AppMediaItem & { article?: { id?: string | number | null } | null })
    : null;

  useEffect(() => {
    if (!isDesktopWeb || typeof document === "undefined") {
      return;
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isDesktopWeb]);

  useEffect(() => {
    setMenuOpen(false);
  }, [activeVideoId, cleanMode, commentsTargetId]);

  useEffect(() => {
    const activeVideo = videos[activeIndex];
    if (!activeVideo) {
      return;
    }

    void preloadMediaNeighbors(videos, activeIndex);
    void recordMediaVideoView(activeVideo.id).then((nextCount) => {
      if (typeof nextCount === "number") {
        updateVideo(activeVideo.id, (video) => ({ ...video, views_count: nextCount }));
      }
    });
  }, [activeIndex, activeVideoId, updateVideo, videos]);

  useEffect(() => {
    return () => {
      const player = activePlayerRef.current;
      if (player) {
        void player.pauseAsync().catch(() => {});
        void player.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const commentsTarget = commentsTargetId
    ? videos.find((video) => video.id === commentsTargetId) ?? null
    : null;

  const toggleCleanMode = useCallback(() => {
    overlayOpacity.stopAnimation();

    if (cleanMode) {
      setCleanMode(false);
      overlayOpacity.setValue(0);
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      return;
    }

    setCommentsTargetId(null);
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setCleanMode(true);
      }
    });
  }, [cleanMode, overlayOpacity]);

  const openArticle = useCallback((articleId: string | number | null | undefined) => {
    if (!articleId) {
      console.log("Biriktirilgan maqola topilmadi");
      if (Platform.OS !== "web") {
        Alert.alert("Biriktirilgan maqola topilmadi");
      }
      return;
    }

    const nextArticleId = String(articleId);
    console.log("[reels] articleId:", nextArticleId);
    setIsLeavingScreen(true);
    setCommentsTargetId(null);
    const player = activePlayerRef.current;
    if (player) {
      void player.pauseAsync().catch(() => {});
    }
    if (Platform.OS === "web") {
      router.replace({
        pathname: "/article/[id]",
        params: { id: nextArticleId },
      });
      return;
    }

    router.replace(`/article/${nextArticleId}` as any);
  }, []);

  const handleLike = useCallback(
    async (item: AppMediaItem) => {
      if (!viewerId) {
        return;
      }

      const nextLiked = !likedIds.has(item.id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (nextLiked) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
        return next;
      });
      updateVideo(item.id, (video) => ({
        ...video,
        likes_count: Math.max(0, video.likes_count + (nextLiked ? 1 : -1)),
      }));

      const result = await setMediaVideoLike(item.id, viewerId, nextLiked);
      if (typeof result.likesCount === "number") {
        updateVideo(item.id, (video) => ({ ...video, likes_count: result.likesCount ?? video.likes_count }));
      }

      if (result.liked !== nextLiked) {
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (nextLiked) {
            next.delete(item.id);
          } else {
            next.add(item.id);
          }
          return next;
        });
        updateVideo(item.id, (video) => ({
          ...video,
          likes_count: Math.max(0, video.likes_count + (nextLiked ? -1 : 1)),
        }));
      }
    },
    [likedIds, updateVideo, viewerId]
  );

  const handleShare = useCallback(
    async (item: AppMediaItem) => {
      const url = resolveReelShareUrl(item);
      const message = url ? `${item.title}\n${url}` : item.title;

      try {
        if (Platform.OS === "web" && typeof navigator !== "undefined" && typeof (navigator as any).share === "function") {
          await (navigator as any).share({ title: item.title, text: item.title, url });
        } else {
          const result = await Share.share({ title: item.title, message, url });
          if (result.action !== Share.sharedAction && Platform.OS !== "android") {
            return;
          }
        }

        updateVideo(item.id, (video) => ({ ...video, shares_count: video.shares_count + 1 }));
        const nextCount = viewerId ? await recordMediaVideoShare(item.id, viewerId) : null;
        if (typeof nextCount === "number") {
          updateVideo(item.id, (video) => ({ ...video, shares_count: nextCount }));
        }
      } catch {
        return;
      }
    },
    [updateVideo, viewerId]
  );

  const handleDoubleTapLike = useCallback(
    (item: AppMediaItem) => {
      if (!viewerId || likedIds.has(item.id)) {
        return;
      }

      void handleLike(item);
    },
    [handleLike, likedIds, viewerId]
  );

  const handleSave = useCallback(
    (item: AppMediaItem) => {
      const resolvedArticleId = resolveReelArticleId(item as AppMediaItem & { article?: { id?: string | number | null } | null });
      if (!resolvedArticleId) {
        return;
      }

      toggleSaved(String(resolvedArticleId));
    },
    [toggleSaved]
  );

  const handleToggleFullscreen = useCallback(async () => {
    if (!isDesktopWeb || typeof document === "undefined") {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        return;
      }

      const viewerElement = document.getElementById(WEB_REELS_VIEWER_ID) as (HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      }) | null;
      await viewerElement?.requestFullscreen?.();
    } catch {
      return;
    }
  }, [isDesktopWeb]);

  const handleCopyActiveLink = useCallback(async () => {
    if (!activeVideo || Platform.OS !== "web" || typeof navigator === "undefined") {
      return;
    }

    const url = resolveReelShareUrl(activeVideo);
    if (!url) {
      return;
    }

    try {
      await (navigator as any).clipboard?.writeText(url);
      setMenuOpen(false);
    } catch {
      void handleShare(activeVideo);
    }
  }, [activeVideo, handleShare]);

  // Pause the previously-active player when activeIndex changes
  const prevActiveIndexRef = useRef(activeIndex);
  useEffect(() => {
    if (prevActiveIndexRef.current !== activeIndex) {
      const player = activePlayerRef.current;
      if (player) {
        void player.pauseAsync().catch(() => {});
      }
      activePlayerRef.current = null;
      prevActiveIndexRef.current = activeIndex;
    }
  }, [activeIndex]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<AppMediaItem>[] }) => {
    const nextIndex = viewableItems[0]?.index;
    if (typeof nextIndex === "number") {
      setActiveIndex(nextIndex);
    }
  }).current;

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <ActivityIndicator color={Palette.red} />
        <Text style={styles.loadingText}>Reels yuklanmoqda...</Text>
      </View>
    );
  }

  if (error || videos.length === 0) {
    return (
      <View style={styles.loadingRoot}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <Text style={styles.loadingErrorTitle}>Videolar topilmadi</Text>
        {!!error && <Text style={styles.loadingErrorText}>{error}</Text>}
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Qayta urinish</Text>
        </Pressable>
      </View>
    );
  }

  const reelsViewerContent = (
    <>
      <View style={[styles.topBar, { top: viewerTopInset + 12 }]}> 
        <GlassSurface style={styles.topButton} intensity={52}>
          <Pressable onPress={() => router.back()} style={styles.topButtonPressable}>
            <ArrowLeft size={20} color={Palette.white} />
          </Pressable>
        </GlassSurface>
        {!cleanMode && (
          <Animated.View style={{ opacity: overlayOpacity }}>
            <GlassSurface style={styles.topButton} intensity={52}>
              <Pressable onPress={() => setMuted((current) => !current)} style={styles.topButtonPressable}>
                {muted ? <VolumeX size={20} color={Palette.white} /> : <Volume2 size={20} color={Palette.white} />}
              </Pressable>
            </GlassSurface>
          </Animated.View>
        )}
      </View>

      {!cleanMode && (
        <Animated.View pointerEvents="none" style={[styles.topBrandWrap, { top: viewerTopInset + 12, opacity: overlayOpacity }]}> 
          <GlassSurface style={styles.topBrandSurface} intensity={44}>
            <Image source={brandLogo} style={styles.topBrandImage} contentFit="contain" />
          </GlassSurface>
        </Animated.View>
      )}

      <FlatList
        ref={listRef}
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const articleId = resolveReelArticleId(item as AppMediaItem & { article?: { id?: string | number | null } | null });

          return (
            <ReelSlide
              item={item}
              isActive={!isLeavingScreen && index === activeIndex}
              shouldLoad={Math.abs(index - activeIndex) <= 2}
              isLiked={likedIds.has(item.id)}
              isSaved={Boolean(articleId && isSaved(String(articleId)))}
              muted={muted}
              width={viewerWidth}
              height={viewerHeight}
              topInset={viewerTopInset}
              insetsBottom={viewerBottomInset}
              onLike={() => void handleLike(item)}
              onDoubleTapLike={() => handleDoubleTapLike(item)}
              onComments={() => setCommentsTargetId(item.id)}
              onShare={() => void handleShare(item)}
              onSave={() => handleSave(item)}
              onOpenArticle={() => openArticle(articleId)}
              onToggleMuted={() => setMuted((current) => !current)}
              cleanMode={cleanMode}
              overlayOpacity={overlayOpacity}
              onToggleCleanMode={toggleCleanMode}
              onPlaybackHandleChange={(player) => {
                if (index === activeIndex) {
                  activePlayerRef.current = player;
                }
              }}
            />
          );
        }}
        pagingEnabled
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: viewerHeight, offset: viewerHeight * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        snapToInterval={viewerHeight}
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={3}
        removeClippedSubviews={Platform.OS !== "ios"}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />
    </>
  );

  return (
    <View style={styles.root} nativeID={isDesktopWeb ? WEB_REELS_VIEWER_ID : undefined}>
      <Stack.Screen
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: Palette.black },
        }}
      />
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {reelsViewerContent}

      <MediaCommentsSheet
        visible={Boolean(commentsTarget)}
        videoId={commentsTarget?.id ?? ""}
        userId={viewerId}
        authorName={authorName}
        initialCount={commentsTarget?.comments_count ?? 0}
        onClose={() => setCommentsTargetId(null)}
        onCommentAdded={() => {
          if (!commentsTarget) {
            return;
          }

          updateVideo(commentsTarget.id, (video) => ({
            ...video,
            comments_count: video.comments_count + 1,
          }));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.black,
  },
  webPhoneRoot: {
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  webPhoneFrame: {
    position: "relative",
    backgroundColor: Palette.black,
    borderRadius: 24,
    overflow: "hidden",
    boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: Palette.black,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: Palette.white,
    fontSize: 14,
  },
  loadingErrorTitle: {
    color: Palette.white,
    fontFamily: Fonts.serif,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  loadingErrorText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: Palette.red,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryButtonText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "700",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  topBrandWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 19,
    alignItems: "center",
  },
  topBrandSurface: {
    minWidth: 150,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
  topBrandImage: {
    width: 118,
    height: 22,
  },
  topButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  topButtonPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  desktopTopControls: {
    position: "absolute",
    right: 24,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  desktopTopControlSurface: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,12,14,0.46)",
    overflow: "hidden",
    boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
  },
  desktopTopControlPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  desktopMenuAnchor: {
    position: "relative",
  },
  desktopMenuWrap: {
    position: "absolute",
    top: 58,
    right: 0,
    width: 200,
    zIndex: 31,
  },
  desktopMenuSurface: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(10,10,12,0.78)",
    padding: 8,
    gap: 4,
    boxShadow: "0 22px 50px rgba(0,0,0,0.42)",
  },
  desktopMenuItem: {
    minHeight: 42,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 14,
    cursor: "pointer",
  },
  desktopMenuItemText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Palette.black,
  },
  listContent: {
    backgroundColor: Palette.black,
  },
  slide: {
    overflow: "hidden",
    backgroundColor: Palette.black,
  },
  desktopSlide: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  desktopBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  desktopBackdropImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.34,
  },
  desktopBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.36)",
  },
  desktopBackdropVerticalVignette: {
    ...StyleSheet.absoluteFillObject,
  },
  desktopBackdropHorizontalVignette: {
    ...StyleSheet.absoluteFillObject,
  },
  desktopShell: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 48,
  },
  desktopViewerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    width: "100%",
    maxWidth: 1200,
  },
  desktopInfoColumn: {
    width: 300,
    gap: 16,
    justifyContent: "center",
    alignSelf: "center",
  },
  desktopInfoTitle: {
    color: Palette.white,
    fontFamily: Fonts.serif,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 29,
    textShadowColor: "rgba(0,0,0,0.32)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  desktopStageShell: {
    position: "relative",
    borderRadius: 12,
  },
  desktopStageGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 18px 48px rgba(0,0,0,0.5), 0 0 72px rgba(255,255,255,0.05)",
  },
  desktopVideoFrame: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Palette.black,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  desktopVideoMedia: {
    width: "100%",
    height: "100%",
  },
  desktopTitleGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
  stage: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: Palette.black,
  },
  glassSurface: {
    overflow: "hidden",
    backgroundColor: "rgba(13,15,20,0.18)",
  },
  chromeFadeLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  stageShadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 168,
  },
  stageShadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "55%",
  },
  centerGestureZone: {
    position: "absolute",
    left: 12,
    right: 102,
  },
  rightGestureZone: {
    position: "absolute",
    right: 72,
    width: 72,
  },
  speedIndicatorWrap: {
    position: "absolute",
    top: 124,
    alignSelf: "center",
  },
  speedIndicator: {
    minWidth: 58,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
  },
  speedIndicatorText: {
    color: Palette.white,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  feedbackWrap: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackBubble: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionRail: {
    position: "absolute",
    right: 14,
    gap: 11,
    alignItems: "center",
    zIndex: 7,
  },
  actionItem: {
    alignItems: "center",
    gap: 5,
  },
  desktopActionItem: {
    gap: 6,
    cursor: "pointer",
    transitionProperty: "transform, opacity",
    transitionDuration: "220ms",
    transitionTimingFunction: "ease",
  },
  desktopActionItemHovered: {
    transform: [{ scale: 1.06 }],
  },
  actionItemDisabled: {
    opacity: 0.36,
  },
  actionItemPressed: {
    opacity: 0.82,
  },
  actionIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  desktopActionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(10,10,12,0.42)",
    boxShadow: "0 12px 34px rgba(0,0,0,0.34)",
  },
  actionIconWrapActive: {
    backgroundColor: "rgba(237,28,36,0.16)",
    borderColor: "rgba(237,28,36,0.38)",
  },
  actionLabel: {
    color: Palette.white,
    fontSize: 11,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  desktopActionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.74)",
  },
  actionLabelActive: {
    color: Palette.red,
  },
  desktopActionRail: {
    gap: 14,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    minWidth: 74,
  },
  desktopCleanRestore: {
    position: "absolute",
    right: 28,
    top: "50%",
    zIndex: 20,
    alignItems: "center",
  },
  desktopCleanRestoreBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  bottomOverlay: {
    position: "absolute",
    left: 16,
    right: 106,
    bottom: 0,
    gap: 10,
    minHeight: 252,
    justifyContent: "flex-end",
    zIndex: 8,
  },
  desktopMiniTitleWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
  },
  desktopMiniTitle: {
    color: Palette.white,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  textGradient: {
    ...StyleSheet.absoluteFillObject,
    left: -16,
    right: -80,
    bottom: -24,
  },
  reelTitle: {
    color: Palette.white,
    fontFamily: Fonts.serif,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25,
    textShadowColor: "rgba(0,0,0,0.24)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  descriptionPressable: {
    alignSelf: "flex-start",
    gap: 6,
    maxWidth: 332,
  },
  reelDescription: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 332,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  descriptionToggle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaText: {
    color: Palette.white,
    fontSize: 12,
    fontWeight: "600",
  },
  articleCardPressable: {
    alignSelf: "flex-start",
    width: "100%",
    maxWidth: 300,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  articleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 10,
    minHeight: 76,
  },
  articleCover: {
    width: 84,
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  articleMeta: {
    flex: 1,
    gap: 5,
    paddingRight: 6,
  },
  articleLabel: {
    color: "rgba(237,28,36,0.94)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  articleTitle: {
    color: Palette.white,
    fontFamily: Fonts.serif,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  articleArrowWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(237,28,36,0.12)",
    borderWidth: 1,
    borderColor: "rgba(237,28,36,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  cleanModeRestoreWrap: {
    position: "absolute",
    right: 14,
    zIndex: 9,
    alignItems: "center",
  },
  cleanModeRestorePressable: {
    alignItems: "center",
    justifyContent: "center",
  },
  cleanModeRestoreSurface: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
});