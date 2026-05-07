import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import type { AppCategory } from "@/lib/types";
import { useColors } from "@/utils/useColors";

type InterestSelectorProps = {
  categories: AppCategory[];
  selectedIds: string[];
  onToggle: (categoryId: string) => void;
  error?: string;
  minimum?: number;
};

export function InterestSelector({ categories, selectedIds, onToggle, error, minimum = 3 }: InterestSelectorProps) {
  const colors = useColors();

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Qiziqishlar</Text>
        <Text style={[styles.counter, { color: selectedIds.length >= minimum ? Palette.red : colors.textSecondary }]}>
          {selectedIds.length}/{minimum}
        </Text>
      </View>

      <Text style={[styles.helper, { color: colors.textSecondary }]}>Kamida 3 ta qiziqish tanlang</Text>

      <View style={styles.grid}>
        {categories.map((category) => {
          const active = selectedIds.includes(category.id);
          return (
            <Pressable
              key={category.id}
              onPress={() => onToggle(category.id)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: active ? Palette.red : colors.background,
                  borderColor: active ? Palette.red : colors.border,
                  opacity: pressed ? 0.86 : 1,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? Palette.white : colors.text }]}>{category.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
  counter: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "700",
  },
  helper: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    color: Palette.red,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "600",
  },
});