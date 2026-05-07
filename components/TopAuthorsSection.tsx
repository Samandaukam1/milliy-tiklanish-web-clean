import { router } from "expo-router";
import { Image } from "expo-image";
import { TrendingUp } from "lucide-react-native";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { useColors } from "@/utils/useColors";
import type { AppAuthor } from "@/lib/types";

interface TopAuthorsProps {
  authors: AppAuthor[];
  onSeeAll?: () => void;
  sidebar?: boolean;
}

export function TopAuthorsSection({ authors, onSeeAll, sidebar = false }: TopAuthorsProps) {
  const colors = useColors();
  if (!authors.length) return null;

  if (sidebar) {
    return (
      <View style={styles.sidebarWrap}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>MUALLIFLAR</Text>
            <Text style={[styles.title, { color: colors.text }]}>Eng ko'p o'qilgan mualliflar</Text>
          </View>
          {onSeeAll && (
            <Pressable onPress={onSeeAll} style={styles.seeAllBtn}>
              <Text style={styles.seeAllText}>Barchasi</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.sidebarList}>
          {authors.slice(0, 8).map((author, index) => (
            <Pressable
              key={author.name}
              style={[styles.sidebarCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() =>
                router.push({ pathname: "/authors", params: { focus: author.name } })
              }
            >
              <View style={styles.sidebarCardInner}>
                {author.imageUrl ? (
                  <Image
                    source={{ uri: author.imageUrl }}
                    style={styles.sidebarAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.sidebarAvatarPlaceholder}>
                    <Text style={styles.sidebarAvatarInitial}>
                      {author.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sidebarAuthorName, { color: colors.text }]} numberOfLines={1}>
                    {author.name}
                  </Text>
                  <View style={styles.statsRow}>
                    <TrendingUp size={11} color={Palette.red} />
                    <Text style={[styles.statsText, { color: colors.textSecondary }]}>
                      {author.articleCount} maqola
                    </Text>
                  </View>
                </View>
                <Text style={styles.sidebarRank}>#{index + 1}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>MUALLIFLAR</Text>
          <Text style={[styles.title, { color: colors.text }]}>Eng ko'p o'qilgan mualliflar</Text>
        </View>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} style={styles.seeAllBtn}>
            <Text style={styles.seeAllText}>Barchasi</Text>
          </Pressable>
        )}
      </View>

      {/* Horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {authors.map((author, index) => (
          <Pressable
            key={author.name}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() =>
              router.push({ pathname: "/authors", params: { focus: author.name } })
            }
          >
            {/* Rank badge */}
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>#{index + 1}</Text>
            </View>

            {/* Avatar */}
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

            <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={2}>
              {author.name}
            </Text>

            <View style={styles.statsRow}>
              <TrendingUp size={12} color={Palette.red} />
              <Text style={[styles.statsText, { color: colors.textSecondary }]}>{author.articleCount} maqola</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const AVATAR_SIZE = 70;

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: Palette.red,
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    marginTop: 2,
  },
  seeAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Palette.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: Palette.textSecondary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    width: 120,
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#ECE6D8",
    position: "relative",
  },
  rankBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: Palette.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rankText: {
    color: Palette.white,
    fontSize: 9,
    fontWeight: "800",
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "#D8D1C3",
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: Palette.white,
    fontSize: 26,
    fontWeight: "800",
  },
  authorName: {
    fontSize: 13,
    fontWeight: "700",
    color: Palette.black,
    textAlign: "center",
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statsText: {
    fontSize: 11,
    color: Palette.textSecondary,
    fontWeight: "600",
  },
  // ─── Sidebar (desktop) ────────────────────────────────────────────────────
  sidebarWrap: { gap: 14 },
  sidebarList: { gap: 10, marginTop: 4 },
  sidebarCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sidebarCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sidebarAvatar: { width: 44, height: 44, borderRadius: 22 },
  sidebarAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarAvatarInitial: {
    color: Palette.white,
    fontSize: 18,
    fontWeight: "800",
  },
  sidebarAuthorName: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  sidebarRank: {
    fontSize: 16,
    fontWeight: "900",
    color: "#D8D1C3",
    fontFamily: Fonts.serif,
  },
});
