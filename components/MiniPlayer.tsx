import { Image } from "expo-image";
import { router } from "expo-router";
import { Pause, Play, X } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Palette } from "@/constants/colors";
import { formatTime, usePlayer } from "@/providers/PlayerProvider";
import { useColors } from "@/utils/useColors";

export function MiniPlayer() {
  const { current, isPlaying, toggle, position, setCurrent } = usePlayer();
  const colors = useColors();
  if (!current) return null;
  const pct = Math.min(1, position / current.durationSec);

  return (
    <Pressable
      testID="mini-player"
      onPress={() => router.push("/player")}
      style={[styles.wrap, { backgroundColor: colors.elevated, borderColor: colors.border }]}
    >
      <Image source={{ uri: current.cover }} style={styles.cover} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {current.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{current.author}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {formatTime(position)} / {formatTime(current.durationSec)}
          </Text>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
        </View>
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          toggle();
        }}
        hitSlop={10}
        style={styles.playBtn}
      >
        {isPlaying ? (
          <Pause size={18} color={Palette.white} fill={Palette.white} />
        ) : (
          <Play size={18} color={Palette.white} fill={Palette.white} />
        )}
      </Pressable>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          setCurrent(null);
        }}
        hitSlop={10}
        style={styles.closeBtn}
      >
        <X size={16} color={Palette.beige} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Palette.white,
    marginHorizontal: 10,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECE6D8",
    shadowColor: Palette.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cover: { width: 44, height: 44, borderRadius: 8 },
  title: { fontSize: 13, fontWeight: "700", color: Palette.black },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  meta: { fontSize: 10, color: Palette.textSecondary },
  progressBg: { height: 2, backgroundColor: "#ECE6D8", borderRadius: 1, marginTop: 6 },
  progressFill: { height: 2, backgroundColor: Palette.red, borderRadius: 1 },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: { padding: 4 },
});
