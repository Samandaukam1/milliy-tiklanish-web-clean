import { router, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, BookOpen } from "lucide-react-native";
import React, { useCallback } from "react";
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
import { ResizeMode } from "expo-av";
import { UploadedVideoPlayer } from "@/components/UploadedVideoPlayer";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { extractYouTubeId } from "@/lib/services";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { useColors } from "@/utils/useColors";

export default function VideoPlayerScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const {
    videoId: rawParam,
    videoUrl: rawVideoUrl,
    type: rawType,
    title,
    description,
    articleId,
    thumbnailUrl,
  } = useLocalSearchParams<{
    videoId: string;
    videoUrl?: string;
    type: string;
    title: string;
    description?: string;
    articleId?: string;
    thumbnailUrl?: string;
  }>();

  const type = rawType === "long" ? "long" : "short";
  const uploadedUrl = rawVideoUrl?.trim() || null;

  // Normalise defensively: param might be a bare ID or a full URL
  const resolvedId = rawParam
    ? (extractYouTubeId(rawParam) ?? rawParam)
    : null;
  const hasUploadedVideo = Boolean(uploadedUrl);
  const hasYouTubeVideo = !hasUploadedVideo && Boolean(resolvedId);

  const onOpenArticle = useCallback(() => {
    if (articleId) {
      router.back();
      setTimeout(() => router.push(`/article/${articleId}`), 300);
    }
  }, [articleId]);

  const playerWidth = isDesktop ? Math.min(width * 0.56, 800) : width;
  const shortPlayerHeight = isDesktop
    ? Math.min(playerWidth * (16 / 9), height * 0.76)
    : height - insets.top - insets.bottom - 56;
  const longPlayerHeight = playerWidth * (9 / 16);
  const shortPlayerWidth = isDesktop ? Math.min(420, width * 0.34) : width;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 8 },
          isDesktop && styles.topBarDesktop,
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          testID="video-player-close"
        >
          <ArrowLeft size={20} color={Palette.white} />
        </Pressable>

        <Text style={styles.topTitle} numberOfLines={1}>
          {title || "Video"}
        </Text>

        {!!articleId && (
          <Pressable onPress={onOpenArticle} style={styles.articleBtn}>
            <BookOpen size={14} color={Palette.white} />
            <Text style={styles.articleBtnText}>Maqola</Text>
          </Pressable>
        )}
      </View>

      {/* Player */}
      {!hasUploadedVideo && !hasYouTubeVideo ? (
        <View style={styles.noVideo}>
          <Text style={styles.noVideoText}>Video topilmadi</Text>
        </View>
      ) : type === "short" ? (
        <View style={styles.shortContainer}>
          <View
            style={[
              styles.shortPlayerWrap,
              {
                width: shortPlayerWidth,
                height: isDesktop
                  ? Math.min(shortPlayerWidth * (16 / 9), height * 0.76)
                  : shortPlayerHeight,
              },
            ]}
          >
            {hasUploadedVideo ? (
              <UploadedVideoPlayer
                uri={uploadedUrl as string}
                posterUri={thumbnailUrl}
                shouldPlay
                useNativeControls
                resizeMode={ResizeMode.COVER}
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <YouTubePlayer videoId={resolvedId as string} style={StyleSheet.absoluteFillObject} />
            )}
          </View>

          {!!articleId && (
            <Pressable onPress={onOpenArticle} style={styles.shortArticleBtn}>
              <BookOpen size={14} color={Palette.white} />
              <Text style={styles.shortArticleBtnText}>{"Maqolani o'qish"}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.longContainer}>
          <View
            style={[
              styles.longPlayerWrap,
              { width: playerWidth, height: longPlayerHeight },
            ]}
          >
            {hasUploadedVideo ? (
              <UploadedVideoPlayer
                uri={uploadedUrl as string}
                posterUri={thumbnailUrl}
                shouldPlay
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <YouTubePlayer videoId={resolvedId as string} style={StyleSheet.absoluteFillObject} />
            )}
          </View>

          <ScrollView
            style={[styles.longInfo, isDesktop && styles.longInfoDesktop, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.longInfoContent}
          >
            {!!title && (
              <Text style={[styles.longTitle, { color: colors.text }]} numberOfLines={3}>
                {title}
              </Text>
            )}
            {!!description && (
              <Text style={[styles.longDescription, { color: colors.textSecondary }]}>{description}</Text>
            )}
            {!!articleId && (
              <Pressable onPress={onOpenArticle} style={styles.longArticleBtn}>
                <BookOpen size={15} color={Palette.red} />
                <Text style={styles.longArticleBtnText}>{"Maqolani o'qish"}</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
    zIndex: 10,
  },
  topBarDesktop: { maxWidth: 1160, alignSelf: "center", width: "100%" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    flex: 1,
    color: Palette.white,
    fontSize: 15,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  articleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  articleBtnText: { color: Palette.white, fontSize: 12, fontWeight: "700" },

  noVideo: { flex: 1, alignItems: "center", justifyContent: "center" },
  noVideoText: { color: "rgba(255,255,255,0.5)", fontSize: 15 },

  shortContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  shortPlayerWrap: { overflow: "hidden", backgroundColor: "#000" },
  shortArticleBtn: {
    position: "absolute",
    bottom: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  shortArticleBtnText: { color: Palette.white, fontSize: 13, fontWeight: "700" },

  longContainer: { flex: 1, backgroundColor: "#000" },
  longPlayerWrap: { alignSelf: "center", backgroundColor: "#000" },
  longInfo: {
    flex: 1,
    backgroundColor: Palette.cream,
    paddingHorizontal: 20,
  },
  longInfoDesktop: {
    maxWidth: 1160,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: 24,
  },
  longInfoContent: {
    paddingVertical: 20,
    gap: 14,
  },
  longTitle: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    lineHeight: 27,
  },
  longDescription: {
    fontSize: 15,
    lineHeight: 22,
  },
  longArticleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(237,28,36,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  longArticleBtnText: { color: Palette.red, fontSize: 14, fontWeight: "700" },
});
