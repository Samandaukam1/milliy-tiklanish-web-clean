import { useTheme } from "@/providers/ThemeProvider";
import Colors from "@/constants/colors";
import { Palette } from "@/constants/colors";

export function useColors() {
  const { theme } = useTheme();
  const c = Colors[theme];
  return {
    ...c,
    textMuted: theme === "dark" ? Palette.darkTextMuted : Palette.textMuted,
    surface: theme === "dark" ? Palette.darkSurface : Palette.creamDeep,
    elevated: theme === "dark" ? Palette.darkElevated : Palette.white,
    iconBg: theme === "dark" ? Palette.darkElevated : Palette.white,
    iconColor: theme === "dark" ? Palette.darkText : Palette.black,
    isDark: theme === "dark",
  };
}