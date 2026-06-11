import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Topilmadi" }} />
      <View style={styles.container}>
        <Text style={styles.kicker}>404</Text>
        <Text style={styles.title}>Sahifa topilmadi</Text>
        <View style={styles.rule} />
        <Text style={styles.text}>Kechirasiz, siz izlayotgan sahifa mavjud emas.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Bosh sahifaga qaytish</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: Palette.cream,
    gap: 8,
  },
  kicker: { color: Palette.beige, fontSize: 12, letterSpacing: 3, fontWeight: "800" },
  title: { fontSize: 28, fontFamily: Fonts.serif, fontWeight: "800", color: Palette.black, marginTop: 6 },
  rule: { width: 32, height: 2, backgroundColor: Palette.red, marginVertical: 10 },
  text: { fontSize: 14, color: Palette.textSecondary, textAlign: "center" },
  link: { marginTop: 20, backgroundColor: Palette.red, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8 },
  linkText: { color: Palette.white, fontWeight: "700" },
});
