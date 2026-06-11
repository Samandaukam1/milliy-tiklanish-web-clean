import { router, Stack } from "expo-router";
import { Search as SearchIcon, X } from "lucide-react-native";
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { ArticleCard } from "@/components/ArticleCard";
import { searchArticles, fetchCategories } from "@/lib/services";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";
import type { AppArticle, AppCategory } from "@/lib/types";

const RECENT = ["Iqtisodiyot", "Samarqand", "Yoshlar", "Futbol"];

export default function SearchScreen() {
  const [q, setQ] = useState<string>("");
  const [results, setResults] = useState<AppArticle[]>([]);
  const [searching, setSearching] = useState(false);
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const { language } = useLanguage();
  const colors = useColors();

  useEffect(() => {
    fetchCategories(language as any).then(setCategories).catch(() => {});
  }, [language]);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await searchArticles(query, language as any);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [language]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(q), 400);
    return () => clearTimeout(timer);
  }, [q, doSearch]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Qidiruv" }} />
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SearchIcon size={18} color={colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Maqola yoki muallif..."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }]}
          autoFocus
          testID="search-input"
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ("")}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {q.length === 0 ? (
        <View style={{ padding: 20, gap: 26 }}>
          <View>
            <Text style={styles.kicker}>SO'NGGI QIDIRUVLAR</Text>
            <View style={styles.chipsRow}>
              {RECENT.map((r) => (
                <Pressable key={r} onPress={() => setQ(r)} style={[styles.chip, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {categories.length > 0 && (
            <View>
              <Text style={styles.kicker}>MASHHUR TEGLAR</Text>
              <View style={styles.chipsRow}>
                {categories.slice(0, 10).map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      router.replace({ pathname: "/(tabs)/articles", params: { cat: c.id } });
                    }}
                    style={[styles.chip, { backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1 }]}
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>#{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      ) : searching ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Palette.red} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 60 }}
          renderItem={({ item }) => <ArticleCard article={item} variant="list" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Hech narsa topilmadi</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Boshqa so'z bilan qidirib ko'ring</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Palette.cream },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Palette.white,
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  input: { flex: 1, fontSize: 14, color: Palette.black },
  kicker: { color: Palette.beige, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { backgroundColor: Palette.creamDeep, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  chipText: { color: Palette.black, fontSize: 13, fontWeight: "600" },
  empty: { alignItems: "center", padding: 40, gap: 6 },
  emptyTitle: { fontSize: 16, fontFamily: Fonts.serif, fontWeight: "700", color: Palette.black },
  emptyText: { color: Palette.textSecondary, fontSize: 13 },
});
