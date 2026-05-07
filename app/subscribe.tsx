import { router, Stack } from "expo-router";
import { Check, Crown, Sparkles, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { Subscription, useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";
import { createPaymePayment, getReturnUrlBase } from "@/lib/payments";

type Tier = {
  id: Subscription;
  name: string;
  price: string;
  tagline: string;
  highlight?: boolean;
  perks: string[];
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Bepul",
    price: "0 so'm",
    tagline: "Boshlang'ich imkoniyatlar",
    perks: ["Kuniga 5 ta maqola", "Asosiy ruknlar", "Bildirishnomalar"],
  },
  {
    id: "premium",
    name: "Premium",
    price: "29 000 so'm / oy",
    tagline: "Cheksiz o'qish va eshitish",
    highlight: true,
    perks: [
      "Reklamasiz o'qish",
      "Barcha maqolalarga kirish",
      "Ovozli versiyalar",
      "Oflayn yuklanmalar",
      "4 ta til",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "89 000 so'm / oy",
    tagline: "Eksklyuziv tahlil va arxiv",
    perks: [
      "VIP maqolalar va longreadlar",
      "Tahririyat bilan suhbatlar",
      "Eski sonlar to'liq arxivi",
      "Premiumdagi hamma narsa",
    ],
  },
];

export default function SubscribeScreen() {
  const { subscription, updateSubscription, deviceUserId, user } = useApp();
  const colors = useColors();
  const [selected, setSelected] = useState<Subscription>(
    subscription === "free" ? "premium" : subscription
  );
  const [paymentLoading, setPaymentLoading] = useState(false);

  const onSubscribe = async () => {
    // Free tier — no payment needed
    if (selected === "free") {
      updateSubscription("free");
      router.back();
      return;
    }

    setPaymentLoading(true);
    try {
      const returnUrlBase = getReturnUrlBase();
      const userId = user?.id || deviceUserId || ("u-" + Date.now().toString(36));

      const result = await createPaymePayment({
        userId,
        type: "subscription",
        tier: selected,
        returnUrlBase,
      });

      if (result.error || !result.payment_url || !result.payment_id) {
        Alert.alert(
          "Xatolik",
          result.error ?? "To'lov tizimiga ulanib bo'lmadi. Qayta urinib ko'ring."
        );
        return;
      }

      console.log("[Subscribe] opening Payme payment URL for tier:", selected, "| payment_id:", result.payment_id);

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.location.assign(result.payment_url);
        }
      } else {
        const browserResult = await WebBrowser.openAuthSessionAsync(
          result.payment_url,
          "rork-app://payment-result"
        );

        console.log("[Subscribe] browser result type:", browserResult.type);

        if (browserResult.type === "success") {
          router.replace(`/payment-result?payment_id=${result.payment_id}&tier=${selected}&type=subscription`);
        } else if (
          browserResult.type === "cancel" ||
          (browserResult as any).type === "dismiss"
        ) {
          // User closed browser without completing
          Alert.alert(
            "To'lov bekor qilindi",
            "Siz to'lov sahifasini yopib qo'ydingiz."
          );
        }
      }
    } catch (e) {
      console.error("[Subscribe] payment error:", e);
      Alert.alert("Xatolik", "To'lov amalga oshirilmadi. Qayta urinib ko'ring.");
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={[styles.close, { backgroundColor: colors.card, borderColor: colors.border }]} testID="sub-close">
          <X size={20} color={colors.iconColor} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
        <View style={styles.heroIcon}>
          <Crown size={28} color={Palette.white} fill={Palette.white} />
        </View>
        <Text style={styles.kicker}>MILLIY TIKLANISH+</Text>
        <Text style={[styles.title, { color: colors.text }]}>{"Yanada chuqurroq o'qing"}</Text>
        <View style={styles.rule} />
        <Text style={[styles.desc, { color: colors.textSecondary }]}>
          Milliy Tiklanish gazetasining eng yaxshi maqolalari, ovozli versiyalari va
          eksklyuziv tahlillari siz uchun.
        </Text>

        <View style={{ gap: 12, marginTop: 24 }}>
          {TIERS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setSelected(t.id)}
              style={[
                styles.card,
                !t.highlight && { backgroundColor: colors.card, borderColor: colors.border },
                selected === t.id && styles.cardSelected,
                t.highlight && styles.cardHighlight,
                selected === t.id && t.highlight && styles.cardHighlightSelected,
              ]}
            >
              <View style={styles.cardTop}>
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.tierName, { color: colors.text }, t.highlight && { color: Palette.white }]}>
                      {t.name}
                    </Text>
                    {t.highlight && (
                      <View style={styles.popular}>
                        <Sparkles size={10} color={Palette.black} />
                        <Text style={styles.popularText}>MASHHUR</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.tagline, { color: colors.textSecondary }, t.highlight && { color: "rgba(255,255,255,0.75)" }]}>
                    {t.tagline}
                  </Text>
                </View>
                <Text style={[styles.price, { color: colors.text }, t.highlight && { color: Palette.white }]}>{t.price}</Text>
              </View>
              <View style={{ gap: 8, marginTop: 14 }}>
                {t.perks.map((p) => (
                  <View key={p} style={styles.perkRow}>
                    <View style={[styles.perkDot, t.highlight && { backgroundColor: Palette.red }]}>
                      <Check size={11} color={Palette.white} />
                    </View>
                    <Text style={[styles.perkText, { color: colors.text }, t.highlight && { color: Palette.white }]}>
                      {p}
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
          ))}
        </View>

        <Text style={styles.paymentsLbl}>{"TO'LOV USULLARI"}</Text>
        <View style={styles.paymentsRow}>
          {["Payme", "Payme QR", "Uzcard", "Humo"].map((p) => (
            <View key={p} style={[styles.payment, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.paymentText, { color: colors.text }]}>{p}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.legal, { color: colors.textMuted }]}>
          {"Obunani istalgan vaqtda bekor qilishingiz mumkin.\nTo'lov Payme orqali xavfsiz amalga oshiriladi."}
        </Text>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={onSubscribe}
          style={[styles.cta, paymentLoading && { opacity: 0.7 }]}
          disabled={paymentLoading}
          testID="sub-cta"
        >
          {paymentLoading ? (
            <ActivityIndicator color={Palette.white} />
          ) : (
            <Text style={styles.ctaText}>
              {selected === "free"
                ? "Bepul rejimda davom etish"
                : "Payme orqali to'lash"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Palette.cream },
  topBar: { paddingHorizontal: 16, paddingTop: 12, alignItems: "flex-end" },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  kicker: { color: Palette.beige, fontSize: 10, letterSpacing: 2.5, fontWeight: "800", marginTop: 16 },
  title: { fontSize: 30, fontFamily: Fonts.serif, fontWeight: "800", color: Palette.black, marginTop: 6 },
  rule: { width: 36, height: 2, backgroundColor: Palette.red, marginTop: 8 },
  desc: { color: Palette.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 12 },
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#ECE6D8",
    backgroundColor: Palette.white,
    padding: 18,
  },
  cardSelected: { borderColor: Palette.red },
  cardHighlight: { backgroundColor: Palette.black, borderColor: Palette.black },
  cardHighlightSelected: { borderColor: Palette.red },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tierName: { fontSize: 18, fontFamily: Fonts.serif, fontWeight: "800", color: Palette.black },
  tagline: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
  price: { fontSize: 14, fontWeight: "800", color: Palette.black },
  popular: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Palette.beigeLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  popularText: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: Palette.black },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  perkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  perkText: { color: Palette.black, fontSize: 13, flex: 1 },
  paymentsLbl: {
    color: Palette.beige,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
    marginTop: 28,
  },
  paymentsRow: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" },
  payment: {
    backgroundColor: Palette.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  paymentText: { fontSize: 12, fontWeight: "700", color: Palette.black },
  legal: { color: Palette.textMuted, fontSize: 11, marginTop: 22, lineHeight: 16 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    paddingBottom: 32,
    backgroundColor: Palette.cream,
    borderTopWidth: 1,
    borderTopColor: "#ECE6D8",
  },
  cta: {
    backgroundColor: Palette.red,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  ctaText: { color: Palette.white, fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
});
