import { Image } from "expo-image";
import { Pause, Play } from "lucide-react-native";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { fetchAudioArticles } from "@/lib/services";
import { formatTime, usePlayer } from "@/providers/PlayerProvider";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";
import type { AppAudioItem } from "@/lib/types";

export default function RadioScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const { current, isPlaying, play, toggle, position } = usePlayer();
  const { language } = useLanguage();
  const colors = useColors();
  const [audioItems, setAudioItems] = useState<AppAudioItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchAudioArticles(language as any);
      setAudioItems(items);
    } catch {
      setAudioItems([]);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => { load(); }, [load]);

  const hero = current ?? audioItems[0] ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={styles.kicker}>TAHRIRIYAT RADIOSI</Text>
        <Text style={[styles.title, { color: colors.text }]}>Eshitiladigan maqolalar</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Palette.red} />
        </View>
      ) : audioItems.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: Palette.textSecondary }}>Audio maqolalar topilmadi</Text>
        </View>
      ) : (
        <FlatList
          data={audioItems}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={
            hero ? (
              <HeroPlayer
                item={hero}
                isDesktop={isDesktop}
                isPlaying={isPlaying && current?.id === hero.id}
                position={current?.id === hero.id ? position : 0}
                onPlay={() => {
                  if (current?.id === hero.id) toggle();
                  else play(hero);
                }}
                onOpen={() => {
                  if (current?.id !== hero.id) play(hero);
                  router.push("/player");
                }}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <Row
              item={item}
              isCurrent={current?.id === item.id}
              isPlaying={isPlaying && current?.id === item.id}
              onPlay={() => {
                if (current?.id === item.id) toggle();
                else play(item);
              }}
              onOpen={() => {
                if (current?.id !== item.id) play(item);
                router.push("/player");
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: colors.border }]} />}
          contentContainerStyle={{ paddingBottom: 180 }}
        />
      )}
    </View>
  );
}

function HeroPlayer({
  item,
  isDesktop,
  isPlaying,
  position,
  onPlay,
  onOpen,
}: {
  item: AppAudioItem;
  isDesktop: boolean;
  isPlaying: boolean;
  position: number;
  onPlay: () => void;
  onOpen: () => void;
}) {
  const pct = Math.min(1, position / item.durationSec);
  const glowAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [glowAnim]);

  const shadowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#ED1C24", "#F5C542"],
  });

  const shadowRadius = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 20],
  });

  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.55, 0.85, 0.55],
  });

  return (
    <Animated.View style={[
      styles.heroCardWrapper,
      isDesktop && styles.heroCardWrapperDesktop,
      { shadowColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity, shadowRadius, elevation: 16 },
    ]}>
      <Pressable
        onPress={onOpen}
        style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}
      >
        <Image source={{ uri: item.cover }} style={styles.heroImage} contentFit="cover" />
        <View style={styles.heroOverlay} />
        <View style={styles.heroInner}>
          <Text style={styles.heroLabel}>HOZIR EFIRDA</Text>
          <Text style={styles.heroTitle} numberOfLines={3}>
            {item.title}
          </Text>
          <Text style={styles.heroAuthor}>{item.author}</Text>
          <Waveform active={isPlaying} />
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.time}>
              {formatTime(position)} / {formatTime(item.durationSec)}
            </Text>
            <Pressable
              testID="hero-play"
              onPress={(e) => {
                e.stopPropagation();
                onPlay();
              }}
              style={styles.heroPlayBtn}
            >
              {isPlaying ? (
                <Pause size={22} color={Palette.white} fill={Palette.white} />
              ) : (
                <Play size={22} color={Palette.white} fill={Palette.white} />
              )}
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Waveform({ active }: { active: boolean }) {
  const bars = useRef(Array.from({ length: 28 }).map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.25));
      return;
    }
    const anims = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, {
            toValue: 0.4 + Math.random() * 0.6,
            duration: 400 + (i % 5) * 80,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(b, {
            toValue: 0.2 + Math.random() * 0.3,
            duration: 400 + (i % 7) * 80,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [active, bars]);

  return (
    <View style={styles.wave}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              height: b.interpolate({ inputRange: [0, 1], outputRange: [4, 34] }),
              opacity: active ? 1 : 0.35,
            },
          ]}
        />
      ))}
    </View>
  );
}

function Row({
  item,
  isCurrent,
  isPlaying,
  onPlay,
  onOpen,
}: {
  item: AppAudioItem;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onOpen: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onOpen} style={styles.row}>
      <Image source={{ uri: item.cover }} style={styles.rowCover} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
          {item.author} · {formatTime(item.durationSec)}
        </Text>
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        style={[styles.playBtn, { backgroundColor: colors.elevated }, isCurrent && styles.playBtnActive]}
      >
        {isCurrent && isPlaying ? (
          <Pause size={18} color={Palette.white} fill={Palette.white} />
        ) : (
          <Play size={18} color={colors.iconColor} fill={colors.iconColor} />
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  kicker: { color: Palette.beige, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  title: {
    fontSize: 28,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    marginTop: 4,
  },
  heroCardWrapper: {
    marginVertical: 16,
    marginHorizontal: 20,
    alignSelf: "stretch",
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  heroCardWrapperDesktop: {
    maxWidth: 1080,
    alignSelf: "center",
    marginHorizontal: 24,
    marginVertical: 28,
  },
  heroCard: {
    width: "100%",
    minHeight: 340,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: Palette.black,
  },
  heroCardDesktop: {
    height: 340,
  },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  heroInner: { flex: 1, padding: 22, justifyContent: "flex-end" },
  heroLabel: { color: Palette.red, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  heroTitle: {
    color: Palette.white,
    fontSize: 24,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    marginTop: 8,
    lineHeight: 30,
  },
  heroAuthor: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 6 },
  wave: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 18,
    height: 36,
  },
  waveBar: { width: 3, backgroundColor: Palette.red, borderRadius: 2 },
  progressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, marginTop: 14 },
  progressFill: { height: 3, backgroundColor: Palette.red, borderRadius: 2 },
  heroBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  time: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontVariant: ["tabular-nums"] },
  heroPlayBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
  },
  rowCover: { width: 64, height: 64, borderRadius: 10 },
  rowTitle: {
    fontSize: 15,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    color: Palette.black,
    marginTop: 4,
  },
  rowMeta: { color: Palette.textSecondary, fontSize: 11, marginTop: 4 },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.black,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnActive: { backgroundColor: Palette.red },
  divider: { height: 1, backgroundColor: "#ECE6D8", marginHorizontal: 20 },
});
