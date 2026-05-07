import { router, Stack } from "expo-router";
import { ArrowLeft, BookOpen } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { fetchIssues, fetchIssueArticlesFull } from "@/lib/services";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";
import { IssueCard } from "@/components/IssueCard";
import type { AppIssue, AppArticle } from "@/lib/types";

export default function ArchivePage() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const [issues, setIssues] = useState<AppIssue[]>([]);
  const [articleMap, setArticleMap] = useState<Record<string, AppArticle[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchIssues(language as any);
      setIssues(data);
      // Load articles for the first 4 issues — others shown without grid
      const top = data.slice(0, 4);
      const results = await Promise.allSettled(
        top.map((issue) => fetchIssueArticlesFull(issue.id, language as any))
      );
      const map: Record<string, AppArticle[]> = {};
      top.forEach((issue, i) => {
        const r = results[i];
        if (r.status === "fulfilled") map[issue.id] = r.value;
      });
      setArticleMap(map);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.page, { paddingTop: isDesktop ? 0 : insets.top, backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Page header */}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.card }, isDesktop && styles.topBarDesktop]}>
        {!isDesktop && (
          <Pressable
            onPress={() => router.back()}
            style={({ hovered }: any) => [
              styles.backBtn,
              { backgroundColor: hovered ? "#F5F0E8" : colors.card, borderColor: colors.border },
            ]}
          >
            <ArrowLeft size={20} color={colors.iconColor} />
          </Pressable>
        )}
        <View style={isDesktop ? styles.topBarInnerDesktop : styles.topBarInner}>
          <Text style={styles.pageKicker}>ARXIV</Text>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Gazeta sonlari</Text>
        </View>
        {!isDesktop && <View style={{ width: 40 }} />}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Palette.red} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            isDesktop && styles.scrollContentDesktop,
          ]}
        >
          {/* Stats banner */}
          <View style={[styles.statsBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <BookOpen size={20} color={Palette.red} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statsTitle, { color: colors.text }]}>Barcha sonlar</Text>
              <Text style={[styles.statsSub, { color: colors.textSecondary }]}>
                {issues.length} ta gazeta soni chop etilgan
              </Text>
            </View>
          </View>

          {/* Issue cards */}
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              articles={articleMap[issue.id] ?? []}
              showTableOfContents={true}
            />
          ))}

          {issues.length === 0 && (
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <Text style={{ color: Palette.textSecondary, fontSize: 15 }}>
                Arxiv hali mavjud emas
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  topBar: {
    borderBottomWidth: 1,
    ...Platform.select({
      web: { position: "sticky" as any, top: 0, zIndex: 10 },
    }),
  },
  topBarDesktop: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  topBarInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  topBarInnerDesktop: {
    maxWidth: 1280,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginLeft: 16,
    marginTop: 14,
    marginBottom: 14,
    ...Platform.select({
      web: { transitionProperty: "background-color", transitionDuration: "150ms" },
    }),
  },
  pageKicker: {
    color: Palette.red,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    lineHeight: 32,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
    gap: 24,
  },
  scrollContentDesktop: {
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 100,
    gap: 28,
  },
  statsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
  },
  statsTitle: {
    fontSize: 15,
    fontFamily: Fonts.serif,
    fontWeight: "800",
  },
  statsSub: {
    fontSize: 12,
    marginTop: 2,
  },
});
