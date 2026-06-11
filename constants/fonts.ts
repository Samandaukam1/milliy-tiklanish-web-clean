import { Platform } from "react-native";

export const Fonts = {
  serif: Platform.select({
    ios: "Georgia",
    android: "serif",
    default: "Georgia, 'Times New Roman', serif",
  }) as string,
  serifBold: Platform.select({
    ios: "Georgia-Bold",
    android: "serif",
    default: "Georgia, 'Times New Roman', serif",
  }) as string,
  sans: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  }) as string,
};
