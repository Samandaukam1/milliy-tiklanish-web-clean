import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { useColors } from "@/utils/useColors";

interface Props {
  title: string;
  kicker?: string;
  action?: string;
  onAction?: () => void;
}

export function SectionTitle({ title, kicker, action, onAction }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        {kicker ? <Text style={styles.kicker}>{kicker.toUpperCase()}</Text> : null}
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={styles.rule} />
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 14 },
  kicker: { color: Palette.beige, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  title: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    color: Palette.black,
    marginTop: 4,
  },
  rule: { height: 2, backgroundColor: Palette.red, width: 28, marginTop: 6 },
  action: { color: Palette.red, fontSize: 13, fontWeight: "600" },
});
