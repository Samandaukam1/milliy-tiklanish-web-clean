import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

export type Language = "uz" | "uz_cy" | "ru" | "en";

const LANGUAGE_KEY = "mt.language.v1";

const translations: Record<Language, any> = {
  uz: require("../translations/uz.json"),
  uz_cy: require("../translations/uz_cy.json"),
  ru: require("../translations/ru.json"),
  en: require("../translations/en.json"),
};

export const [LanguageProvider, useLanguage] = createContextHook(() => {
  const [language, setLanguage] = useState<Language>("uz");

  const storageQuery = useQuery({
    queryKey: ["mt.language"],
    queryFn: async () => {
      const lang = await AsyncStorage.getItem(LANGUAGE_KEY);
      return (lang as Language) || "uz";
    },
  });

  useEffect(() => {
    if (storageQuery.data) {
      setLanguage(storageQuery.data);
    }
  }, [storageQuery.data]);

  const persistLanguage = useMutation({
    mutationFn: async (lang: Language) => {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
      return lang;
    },
  });

  const changeLanguage = useCallback(
    (lang: Language) => {
      setLanguage(lang);
      persistLanguage.mutate(lang);
    },
    [persistLanguage]
  );

  const t = useCallback(
    (key: string, fallback?: string) => {
      const keys = key.split(".");
      let value: any = translations[language];
      for (const k of keys) {
        value = value?.[k];
      }
      return value || fallback || key;
    },
    [language]
  );

  return useMemo(
    () => ({
      language,
      changeLanguage,
      t,
      isReady: !storageQuery.isLoading,
    }),
    [language, changeLanguage, t, storageQuery.isLoading]
  );
});