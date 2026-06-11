import { Image } from "expo-image";
import { router } from "expo-router";
import {
  ChevronDown,
  Gauge,
  Heart,
  Pause,
  Play,
  Rewind,
  FastForward,
  Share2,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { formatTime, usePlayer } from "@/providers/PlayerProvider";
import { useColors } from "@/utils/useColors";

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const { current, isPlaying, position, speed, loadingAudio, audioError, toggle, seek, skip, cycleSpeed } = usePlayer();
  const colors = useColors();
  const [liked, setLiked] = useState<boolean>(false);
  const [barWidth, setBarWidth] = useState<number>(1);

  const pct = useMemo(() => {
    if (!current) return 0;
    return Math.min(1, position / current.durationSec);
  }, [current, position]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => {
          if (!current) return;
          const ratio = Math.max(0, Math.min(1, g.moveX / barWidth));
          seek(ratio * current.durationSec);
        },
        onPanResponderGrant: (e) => {
          if (!current) return;
          const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth));
          seek(ratio * current.durationSec);
        },
      }),
    [barWidth, current, seek]
  );

  if (!current) {
    return (
      <View style={[styles.empty, { paddingTop: insets.top + 40, backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Eshitish uchun maqola tanlang</Text>
        <Pressable onPress={() => router.back()} style={styles.closeText}>
          <Text style={{ color: Palette.red }}>Yopish</Text>
        </Pressable>
      </View>
    );
  }

  const onTap = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    toggle();
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: colors.background }, isDesktop && styles.wrapDesktop]}>
      <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
        <View style={[styles.card, isDesktop && styles.cardDesktop]}>
          <View style={[styles.topBar, { backgroundColor: colors.background }, isDesktop && styles.topBarDesktop]}>
            <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]} testID="player-close">
              <ChevronDown size={24} color={colors.iconColor} />
            </Pressable>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={styles.topKicker}>HOZIR EFIRDA</Text>
              <Text style={[styles.topTitle, { color: colors.text }]}>Tahririyat radiosi</Text>
            </View>
            <Pressable style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Share2 size={18} color={colors.iconColor} />
            </Pressable>
          </View>

          <View style={[styles.playerBody, isDesktop && styles.playerBodyDesktop]}>
            <View style={[styles.coverWrap, isDesktop && styles.coverWrapDesktop]}>
              <Image source={{ uri: current.cover }} style={[styles.cover, isDesktop && styles.coverDesktop]} contentFit="cover" />
            </View>

            <View style={[styles.info, isDesktop && styles.infoDesktop]}>
              <View style={[styles.metaBlock, isDesktop && styles.metaBlockDesktop]}>
                <Text style={[styles.title, { color: colors.text }, isDesktop && styles.titleDesktop]} numberOfLines={3}>
                  {current.title}
                </Text>
                <Text style={[styles.author, { color: colors.textSecondary }, isDesktop && styles.authorDesktop]}>{current.author}</Text>
              </View>

              <View style={[styles.progressSection, isDesktop && styles.progressSectionDesktop]}>
                <View
                  style={styles.progressBg}
                  onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                  {...panResponder.panHandlers}
                >
                  <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
                  <View style={[styles.knob, { left: `${pct * 100}%` }]} />
                </View>
                <View style={styles.timeRow}>
                  <Text style={[styles.time, { color: colors.textSecondary }]}>{formatTime(position)}</Text>
                  <Text style={[styles.time, { color: colors.textSecondary }]}>-{formatTime(current.durationSec - position)}</Text>
                </View>
              </View>

              <View style={[styles.controls, isDesktop && styles.controlsDesktop]}>
                <Pressable onPress={cycleSpeed} style={[styles.sideBtn, { backgroundColor: colors.card, borderColor: colors.border }]} testID="speed-btn">
                  <Gauge size={18} color={colors.iconColor} />
                  <Text style={[styles.speedText, { color: colors.text }]}>{speed}x</Text>
                </Pressable>
                <Pressable onPress={() => skip(-15)} style={styles.skipBtn}>
                  <Rewind size={26} color={colors.iconColor} fill={colors.iconColor} />
                  <Text style={styles.skipLbl}>15</Text>
                </Pressable>
                <Pressable
                  onPress={loadingAudio ? undefined : onTap}
                  style={[styles.playBtn, loadingAudio && styles.playBtnLoading]}
                  testID="player-toggle"
                >
                  {loadingAudio ? (
                    <ActivityIndicator color={Palette.white} size="small" />
                  ) : isPlaying ? (
                    <Pause size={32} color={Palette.white} fill={Palette.white} />
                  ) : (
                    <Play size={32} color={Palette.white} fill={Palette.white} />
                  )}
                </Pressable>
                <Pressable onPress={() => skip(15)} style={styles.skipBtn}>
                  <FastForward size={26} color={colors.iconColor} fill={colors.iconColor} />
                  <Text style={styles.skipLbl}>15</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                    setLiked((v) => !v);
                  }}
                  style={[styles.sideBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Heart
                    size={20}
                    color={liked ? Palette.red : colors.iconColor}
                    fill={liked ? Palette.red : "transparent"}
                  />
                </Pressable>
              </View>

              {!!audioError && (
                <View style={styles.audioErrorBanner}>
                  <Text style={styles.audioErrorText}>
                    Audio yuklanmadi. URL-ni tekshiring.
                  </Text>
                  {__DEV__ && (
                    <Text style={styles.audioErrorDetail} numberOfLines={2}>
                      {audioError}
                    </Text>
                  )}
                </View>
              )}

              <Pressable
                onPress={() => router.replace(`/article/${current.articleId}`)}
                style={[styles.readFull, isDesktop && styles.readFullDesktop]}
              >
                <Text style={styles.readFullText}>Maqolani o'qish →</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Palette.cream },
  wrapDesktop: { alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 44, minHeight: 760 },
  empty: { flex: 1, alignItems: "center" },
  emptyText: { color: Palette.textSecondary, fontSize: 14 },
  closeText: { marginTop: 8 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Palette.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  topKicker: { color: Palette.red, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  topTitle: { color: Palette.black, fontSize: 13, fontWeight: "700", marginTop: 2 },
  shell: { width: "100%" },
  shellDesktop: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 34 },
  card: {},
  cardDesktop: {
    backgroundColor: Palette.white,
    borderRadius: 34,
    padding: 32,
    shadowColor: Palette.black,
    shadowOpacity: 0.08,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  topBarDesktop: { paddingHorizontal: 0, paddingTop: 12, paddingBottom: 20 },
  playerBody: { width: "100%" },
  playerBodyDesktop: { flexDirection: "row", alignItems: "flex-start" },
  coverWrap: {
    alignItems: "center",
    marginTop: 22,
    paddingHorizontal: 40,
  },
  coverWrapDesktop: { flex: 0.46, marginTop: 0, paddingHorizontal: 0 },
  cover: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 22,
    backgroundColor: Palette.black,
  },
  coverDesktop: {
    maxWidth: 420,
    borderRadius: 28,
  },
  info: { width: "100%", paddingHorizontal: 26, alignItems: "center" },
  infoDesktop: { flex: 1, marginLeft: 28, width: "auto", paddingHorizontal: 0, alignItems: "flex-start" },
  metaBlock: { alignItems: "center" },
  metaBlockDesktop: { alignItems: "flex-start" },
  progressSection: { width: "100%", marginTop: 28 },
  progressSectionDesktop: { width: "100%", maxWidth: 620, marginTop: 28 },
  controlsDesktop: { justifyContent: "space-between", paddingHorizontal: 0, width: "100%", maxWidth: 620, alignSelf: "center" },
  readFullDesktop: { alignSelf: "center", marginTop: 34 },
  titleDesktop: { textAlign: "left", fontSize: 32, lineHeight: 40, marginTop: 24 },
  title: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    marginTop: 26,
    textAlign: "center",
    lineHeight: 28,
  },
  authorDesktop: { marginTop: 12, textAlign: "left" },
  author: { color: Palette.textSecondary, fontSize: 13, marginTop: 10 },
  progressBg: {
    height: 4,
    backgroundColor: "#ECE6D8",
    borderRadius: 2,
    position: "relative",
    justifyContent: "center",
  },
  progressFill: { height: 4, backgroundColor: Palette.red, borderRadius: 2 },
  knob: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Palette.red,
    marginLeft: -7,
    borderWidth: 2,
    borderColor: Palette.white,
  },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  time: { color: Palette.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 30,
    marginTop: 30,
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  speedText: { fontSize: 9, fontWeight: "800", color: Palette.black, marginTop: 2 },
  skipBtn: { alignItems: "center", justifyContent: "center", width: 52, height: 52 },
  skipLbl: { position: "absolute", fontSize: 9, fontWeight: "800", color: Palette.white, marginTop: 2 },
  playBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Palette.red,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  playBtnLoading: { opacity: 0.7 },
  audioErrorBanner: {
    backgroundColor: "rgba(237,28,36,0.08)",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    gap: 4,
  },
  audioErrorText: {
    color: Palette.red,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  audioErrorDetail: {
    color: Palette.textSecondary,
    fontSize: 11,
    textAlign: "center",
  },
  readFull: { alignItems: "center", marginTop: 30 },
  readFullText: { color: Palette.red, fontSize: 13, fontWeight: "700" },
});
