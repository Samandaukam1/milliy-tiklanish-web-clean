import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { formatUzDate } from "@/utils/date";
import { useColors } from "@/utils/useColors";
import type { AppIssue } from "@/lib/types";

interface Props {
  issue: AppIssue;
}

export function IssueCardSimple({ issue }: Props) {
  const colors = useColors();

  const goToIssue = (e?: any) => {
    e?.stopPropagation?.();
    router.push({ pathname: "/issue/[id]", params: { id: issue.id } });
  };

  const openPdf = (e?: any) => {
    e?.stopPropagation?.();
    if (issue.pdfUrl) Linking.openURL(issue.pdfUrl).catch(() => {});
  };

  return (
    <Pressable
      onPress={goToIssue}
      style={({ pressed }: any) => [
        styles.card,
        {
          backgroundColor: colors.elevated,
          borderColor: colors.isDark ? "rgba(255,255,255,0.08)" : colors.border,
        },
        pressed && styles.cardPressed,
      ]}
    >
      <View
        style={[
          styles.coverShell,
          { backgroundColor: colors.isDark ? "#111111" : "#F5F1EA" },
        ]}
      >
        <Image
          source={{ uri: issue.cover }}
          style={styles.cover}
          contentFit="contain"
          contentPosition="center"
        />
      </View>

      <View style={styles.meta}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>SON #{issue.number}</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {issue.title || "So'nggi son"}
        </Text>

        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {formatUzDate(new Date(issue.publishedAt))}
        </Text>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={goToIssue}
            style={({ pressed }: any) => [styles.primaryBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.primaryBtnText}>O'qish</Text>
          </Pressable>

          <Pressable
            disabled={!issue.pdfUrl}
            onPress={openPdf}
            style={({ pressed }: any) => [
              styles.secondaryBtn,
              {
                backgroundColor: colors.isDark ? "#22211E" : "#F4EFE5",
                borderColor: colors.isDark ? "rgba(255,255,255,0.1)" : colors.border,
                opacity: issue.pdfUrl ? 1 : 0.55,
              },
              pressed && issue.pdfUrl && styles.btnPressed,
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>PDF yuklab olish</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    borderRadius: 24,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    ...Platform.select({
      web: {
        boxShadow: "0 10px 28px rgba(17,17,17,0.08)",
      } as any,
      default: {
        shadowColor: "#111111",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 4,
      },
    }),
  },
  cardPressed: {
    opacity: 0.92,
  },
  coverShell: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: 20,
    overflow: "hidden",
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  meta: {
    gap: 10,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(237,28,36,0.12)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Palette.red,
    letterSpacing: 0.7,
    fontFamily: Fonts.sans,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
    fontFamily: Fonts.serif,
  },
  date: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: Palette.red,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Fonts.sans,
    textAlign: "center",
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: "700",
    textAlign: "center",
  },
  btnPressed: {
    opacity: 0.88,
  },
});

