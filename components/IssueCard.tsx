import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Download, FileText, Newspaper, Crown } from "lucide-react-native";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import type { AppArticle, AppIssue } from "@/lib/types";

interface IssueCardProps {
  issue: AppIssue;
  articles?: AppArticle[];
  showTableOfContents?: boolean;
}

export function IssueCard({ issue, articles = [], showTableOfContents = true }: IssueCardProps) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 600;

  const openPdf = (e?: any) => {
    e?.stopPropagation?.();
    if (issue.pdfUrl) Linking.openURL(issue.pdfUrl).catch(() => {});
  };

  const goToIssue = () =>
    router.push({ pathname: "/issue/[id]", params: { id: issue.id } });

  const goToArticle = (id: string, e?: any) => {
    e?.stopPropagation?.();
    router.push({ pathname: "/article/[id]", params: { id } });
  };

  const hasArticles = showTableOfContents && articles.length > 0;

  return (
    <Pressable
      onPress={goToIssue}
      style={({ hovered }: any) => [
        styles.card,
        Platform.OS === "web" && hovered && styles.cardHovered,
      ]}
    >
      <LinearGradient
        colors={["#C91019", "#7A0A0F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.3 }}
        style={styles.gradient}
      >
        <View style={[styles.inner, isNarrow && styles.innerMobile]}>

          {/* ── LEFT: cover image ─────────────────────────────────── */}
          <View style={[styles.coverShell, isNarrow && styles.coverShellMobile]}>
            <Image
              source={{ uri: issue.cover }}
              style={styles.cover}
              contentFit="contain"
            />
          </View>

          {/* ── RIGHT: content ────────────────────────────────────── */}
          <View style={styles.content}>

            {/* Issue badge */}
            <View style={styles.badgeRow}>
              <View style={styles.issueBadge}>
                <Text style={styles.issueBadgeText}>SON #{issue.number}</Text>
              </View>
            </View>

            <Text style={styles.gazetaName}>Milliy Tiklanish gazetasi</Text>
            <Text style={styles.issueTitle} numberOfLines={2}>{issue.title}</Text>

            {/* Article grid — 2 columns */}
            {hasArticles && (
              <View style={[styles.articleGrid, isNarrow && styles.articleGridMobile]}>
                {articles.slice(0, isNarrow ? 4 : 6).map((art) => (
                  <Pressable
                    key={art.id}
                    style={({ hovered }: any) => [
                      styles.articleRow,
                      Platform.OS === "web" && hovered && styles.articleRowHovered,
                    ]}
                    onPress={(e) => goToArticle(art.id, e)}
                  >
                    <Newspaper size={12} color="rgba(255,255,255,0.55)" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                    <Text style={styles.articleTitle} numberOfLines={2}>{art.title}</Text>
                    {art.tier !== "free" && (
                      <View style={styles.premiumDot}>
                        <Crown size={8} color={Palette.gold} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Actions */}
            <View style={styles.actionsRow}>
              <Pressable
                style={({ hovered }: any) => [
                  styles.readBtn,
                  Platform.OS === "web" && hovered && styles.readBtnHovered,
                ]}
                onPress={goToIssue}
              >
                <FileText size={14} color={Palette.red} />
                <Text style={styles.readBtnText}>O'qish</Text>
              </Pressable>

              {issue.pdfUrl && (
                <Pressable
                  style={({ hovered }: any) => [
                    styles.pdfBtn,
                    Platform.OS === "web" && hovered && styles.pdfBtnHovered,
                  ]}
                  onPress={openPdf}
                >
                  <Download size={14} color="rgba(255,255,255,0.90)" />
                  <Text style={styles.pdfBtnText}>PDF</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 4px 24px rgba(140,8,14,0.28)",
        transitionProperty: "transform, box-shadow",
        transitionDuration: "220ms",
        cursor: "pointer",
      },
      default: {
        shadowColor: "#8C080E",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
        elevation: 8,
      },
    }),
  },
  cardHovered: {
    ...Platform.select({
      web: {
        transform: [{ translateY: -4 }],
        boxShadow: "0 16px 40px rgba(140,8,14,0.38)",
      },
    }),
  },
  gradient: {
    borderRadius: 22,
  },
  inner: {
    flexDirection: "row",
    alignItems: "stretch",
    padding: 24,
    gap: 24,
  },
  innerMobile: {
    flexDirection: "column",
    gap: 16,
    padding: 18,
  },

  // ── Cover ──────────────────────────────────────────────────────────────────
  coverShell: {
    width: 160,
    flexShrink: 0,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.96)",
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.38)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.38,
        shadowRadius: 14,
        elevation: 10,
      },
    }),
  },
  coverShellMobile: {
    width: "100%",
    height: 180,
  },
  cover: {
    width: "100%",
    aspectRatio: 0.707, // A4 portrait
  },

  // ── Content ────────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },
  issueBadge: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  issueBadgeText: {
    color: "rgba(255,255,255,0.90)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  gazetaName: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  issueTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    lineHeight: 26,
    letterSpacing: -0.3,
    marginBottom: 6,
  },

  // ── Article grid ───────────────────────────────────────────────────────────
  articleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  articleGridMobile: {
    flexDirection: "column",
  },
  articleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    width: "48%",
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    ...Platform.select({
      web: {
        transitionProperty: "background-color",
        transitionDuration: "150ms",
        cursor: "pointer",
      },
    }),
  },
  articleRowHovered: {
    ...Platform.select({
      web: { backgroundColor: "rgba(0,0,0,0.30)" },
    }),
  },
  articleTitle: {
    flex: 1,
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  premiumDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  readBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9,
    ...Platform.select({
      web: {
        transitionProperty: "opacity",
        transitionDuration: "150ms",
        cursor: "pointer",
      },
    }),
  },
  readBtnHovered: {
    ...Platform.select({ web: { opacity: 0.88 } }),
  },
  readBtnText: {
    color: Palette.red,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    ...Platform.select({
      web: {
        transitionProperty: "background-color",
        transitionDuration: "150ms",
        cursor: "pointer",
      },
    }),
  },
  pdfBtnHovered: {
    ...Platform.select({ web: { backgroundColor: "rgba(255,255,255,0.20)" } }),
  },
  pdfBtnText: {
    color: "rgba(255,255,255,0.90)",
    fontSize: 13,
    fontWeight: "700",
  },
});
