import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "mt.theme.v1";

export const [ThemeProvider, useTheme] = createContextHook(() => {
  const [theme, setTheme] = useState<Theme>("light");

  const storageQuery = useQuery({
    queryKey: ["mt.theme"],
    queryFn: async () => {
      const th = await AsyncStorage.getItem(THEME_KEY);
      return (th as Theme) || "light";
    },
  });

  useEffect(() => {
    if (storageQuery.data) {
      setTheme(storageQuery.data);
    }
  }, [storageQuery.data]);

  const persistTheme = useMutation({
    mutationFn: async (th: Theme) => {
      await AsyncStorage.setItem(THEME_KEY, th);
      return th;
    },
  });

  const changeTheme = useCallback(
    (th: Theme) => {
      setTheme(th);
      persistTheme.mutate(th);
    },
    [persistTheme]
  );

  return useMemo(
    () => ({
      theme,
      changeTheme,
      isReady: !storageQuery.isLoading,
    }),
    [theme, changeTheme, storageQuery.isLoading]
  );
});