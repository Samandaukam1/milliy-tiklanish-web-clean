import { Tabs } from "expo-router";
import { Home, Newspaper, Radio, Film, User } from "lucide-react-native";
import React, { useEffect } from "react";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { MiniPlayer } from "@/components/MiniPlayer";
import { preloadMediaItems } from "@/lib/services";
import { usePlayer } from "@/providers/PlayerProvider";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";

function TabBarBackground() {
  const colors = useColors();
  return <View style={{ flex: 1, backgroundColor: colors.card }} />;
}

function MiniPlayerHost() {
  const { current } = usePlayer();
  if (!current) return null;
  return (
    <View style={styles.miniPlayerHost} pointerEvents="box-none">
      <MiniPlayer />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useLanguage();
  const { language } = useLanguage();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  useEffect(() => {
    void preloadMediaItems(language as any);
  }, [language]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.tabIconDefault,
          headerShown: false,
          tabBarStyle: isDesktop
            ? { display: "none" }
            : {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                borderTopWidth: 1,
                height: Platform.OS === "ios" ? 88 : 64,
                paddingTop: 8,
                ...Platform.select({
                  web: {
                    position: "fixed" as any,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 100,
                  },
                }),
              },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
          tabBarBackground: isDesktop ? undefined : TabBarBackground,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("tabs.home"),
            tabBarIcon: ({ color, size }) => <Home color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="articles"
          options={{
            title: t("tabs.articles"),
            tabBarIcon: ({ color, size }) => <Newspaper color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="radio"
          options={{
            title: t("tabs.radio"),
            tabBarIcon: ({ color, size }) => <Radio color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="media"
          options={{
            title: t("tabs.media"),
            tabBarIcon: ({ color, size }) => <Film color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t("tabs.profile"),
            tabBarIcon: ({ color, size }) => <User color={color} size={size ?? 22} />,
          }}
        />
      </Tabs>
      <MiniPlayerHost />
    </View>
  );
}

const styles = StyleSheet.create({
  miniPlayerHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? 88 : 64,
  },
});
