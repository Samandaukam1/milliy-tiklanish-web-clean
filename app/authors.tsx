import { router, Stack } from "expo-router";
import { Image } from "expo-image";
import { ArrowLeft, TrendingUp, ChevronRight } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { fetchTopAuthors, fetchArticles } from "@/lib/services";
import { useLanguage } from "@/providers/LanguageProvider";
import type { AppAuthor } from "@/lib/types";
import { useColors } from "@/utils/useColors";

export default function AuthorsPage() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const colors = useColors();
  const [authors, setAuthors] = useState<AppAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchTopAuthors(language as any);
      setAuthors(data);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.page, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.iconColor} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Eng ko'p o'qilgan mualliflar</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Palette.red} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Eng ko'p maqola yozgan va o'qilgan mualliflar reytingi
          </Text>

          {authors.map((author, index) => (
            <View key={author.name} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.rankBadge, index < 3 && styles.rankBadgeTop]}>
                <Text style={styles.rankText}>#{index + 1}</Text>
              </View>

              {author.imageUrl ? (
                <Image
                  source={{ uri: author.imageUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {author.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.text }]}>{author.name}</Text>
                {!!author.bio && (
                  <Text style={styles.bio} numberOfLines={2}>
                    {author.bio}
                  </Text>
                )}
                <View style={styles.statsRow}>
                  <TrendingUp size={13} color={Palette.red} />
                  <Text style={[styles.statsText, { color: colors.textSecondary }]}>{author.articleCount} ta maqola</Text>
                </View>
              </View>

              <Pressable
                style={styles.arrowBtn}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/articles",
                    params: { author: author.name },
                  })
                }
              >
                <ChevronRight size={20} color={Palette.textSecondary} />
              </Pressable>
            </View>
          ))}

          {authors.length === 0 && (
            <View style={{ padding: 40, alignItems: "center" }}>
              <Text style={{ color: Palette.textSecondary }}>
                Mualliflar hali mavjud emas
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const AVATAR = 56;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Palette.cream },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ECE6D8",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  pageTitle: {
    fontSize: 15,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 80,
    gap: 12,
  },
  subtitle: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ECE6D8",
    position: "relative",
  },
  rankBadge: {
    position: "absolute",
    top: -8,
    left: 14,
    backgroundColor: Palette.beige,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  rankBadgeTop: {
    backgroundColor: Palette.red,
  },
  rankText: {
    color: Palette.white,
    fontSize: 10,
    fontWeight: "800",
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: "#D8D1C3",
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitial: {
    color: Palette.white,
    fontSize: 22,
    fontWeight: "800",
  },
  info: { flex: 1, gap: 3 },
  name: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.black,
    marginTop: 6,
  },
  bio: {
    fontSize: 12,
    color: Palette.textSecondary,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  statsText: {
    fontSize: 12,
    color: Palette.red,
    fontWeight: "700",
  },
  arrowBtn: {
    padding: 8,
  },
});
