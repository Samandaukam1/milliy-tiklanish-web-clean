import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { useLanguage } from "@/providers/LanguageProvider";

const languages = [
  { code: "uz", nameKey: "languageNames.uz" },
  { code: "uz_cy", nameKey: "languageNames.uz_cy" },
  { code: "ru", nameKey: "languageNames.ru" },
  { code: "en", nameKey: "languageNames.en" },
] as const;

export default function LanguageScreen() {
  const insets = useSafeAreaInsets();
  const { language, changeLanguage, t } = useLanguage();

  const selectLanguage = (lang: string) => {
    changeLanguage(lang as any);
    router.back();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Palette.cream }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 180 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t("profile.language")}</Text>
        <Text style={styles.subtitle}>
          {t("common.selectLanguage")}
        </Text>
      </View>

      <View style={styles.list}>
        {languages.map((lang) => (
          <Pressable
            key={lang.code}
            style={[
              styles.item,
              language === lang.code && styles.itemSelected,
            ]}
            onPress={() => selectLanguage(lang.code)}
          >
            <Text
              style={[
                styles.itemText,
                language === lang.code && styles.itemTextSelected,
              ]}
            >
              {t(lang.nameKey)}
            </Text>
            {language === lang.code && (
              <View style={styles.check}>
                <Text style={styles.checkText}>✓</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    color: Palette.black,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Palette.textSecondary,
    lineHeight: 24,
  },
  list: {
    backgroundColor: Palette.white,
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  itemSelected: {
    backgroundColor: Palette.cream,
  },
  itemText: {
    fontSize: 16,
    color: Palette.black,
  },
  itemTextSelected: {
    fontWeight: "600",
    color: Palette.red,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    color: Palette.white,
    fontSize: 14,
    fontWeight: "600",
  },
});