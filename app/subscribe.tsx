import { router, Stack } from "expo-router";
import { Check, Clock, Crown, Sparkles, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";
import { createPaymePayment, getReturnUrlBase } from "@/lib/payments";

const DEAL_DURATION_SECONDS = 59 * 60 + 12;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string | null | undefined): boolean {
  return typeof id === "string" && UUID_RE.test(id);
}

function showAuthRequiredAlert() {
  Alert.alert(
    "Kirish talab qilinadi",
    "Obuna bo'lish uchun avval ro'yxatdan o'ting yoki tizimga kiring.",
    [
      { text: "Ro'yxatdan o'tish", onPress: () => router.push("/register") },
      { text: "Tizimga kirish", onPress: () => router.push("/login") },
      { text: "Bekor qilish", style: "cancel" },
    ]
  );
}

const PREMIUM_FEATURES = [
  "Premium maqolalarni cheklovlarsiz o'qish",
  "Gazetaning PDF sonlarini yuklab olish",
  "Tahririyatga maqola yuborish imkoniyati",
  "Cheksiz audio maqolalarni tinglash",
  "Media va videolarni cheksiz tomosha qilish",
  "Gazetalar arxiviga to'liq kirish",
];

function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export default function SubscribeScreen() {
  const { deviceUserId, user, subscription } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isPremiumActive = subscription === "premium" || subscription === "pro";
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [dealSecondsLeft, setDealSecondsLeft] = useState(DEAL_DURATION_SECONDS);
  const dealDeadlineRef = useRef(Date.now() + DEAL_DURATION_SECONDS * 1000);
  const cardGlow = useRef(new Animated.Value(0)).current;
  const ctaPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const updateRemaining = () => {
      const nextSeconds = Math.max(
        0,
        Math.ceil((dealDeadlineRef.current - Date.now()) / 1000)
      );
      setDealSecondsLeft(nextSeconds);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(cardGlow, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: false,
        }),
        Animated.timing(cardGlow, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: false,
        }),
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, {
          toValue: 1,
          duration: 1300,
          useNativeDriver: false,
        }),
        Animated.timing(ctaPulse, {
          toValue: 0,
          duration: 1300,
          useNativeDriver: false,
        }),
      ])
    );

    glowLoop.start();
    pulseLoop.start();

    return () => {
      glowLoop.stop();
      pulseLoop.stop();
    };
  }, [cardGlow, ctaPulse]);

  const onSubscribe = async () => {
    if (!user || !isValidUuid(user.id)) {
      showAuthRequiredAlert();
      return;
    }

    setPaymentLoading(true);
    try {
      const returnUrlBase = getReturnUrlBase();
      const userId = user.id;

      const result = await createPaymePayment({
        userId,
        type: "subscription",
        tier: "premium",
        returnUrlBase,
      });

      if (result.error === "AUTH_REQUIRED") {
        showAuthRequiredAlert();
        return;
      }

      if (result.error || !result.payment_url || !result.payment_id) {
        Alert.alert(
          "Xatolik",
          result.error ?? "To'lov tizimiga ulanib bo'lmadi. Qayta urinib ko'ring."
        );
        return;
      }

      console.log("[Subscribe] opening Payme payment URL for tier: premium | payment_id:", result.payment_id);

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
          router.replace(`/payment-result?payment_id=${result.payment_id}&tier=premium&type=subscription`);
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

  const countdown = formatCountdown(dealSecondsLeft);
  const cardBorderColor = cardGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(237,28,36,0.48)", "rgba(245,197,66,0.95)"],
  });
  const cardShadowOpacity = cardGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.56],
  });
  const cardShadowRadius = cardGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 28],
  });
  const ctaShadowOpacity = ctaPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.68],
  });
  const ctaShadowRadius = ctaPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 26],
  });
  const ctaPulseScale = ctaPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.012],
  });

  const footerPaddingBottom: any = Platform.OS === "web"
    ? "calc(18px + env(safe-area-inset-bottom))"
    : Math.max(28, insets.bottom + 10);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: 12 + insets.top }]}>
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

        <View style={styles.singlePlanWrap}>
          <Animated.View
            style={[
              styles.premiumGlowShell,
              {
                borderColor: cardBorderColor,
                shadowOpacity: cardShadowOpacity,
                shadowRadius: cardShadowRadius,
              } as any,
            ]}
          >
            <Pressable
              style={({ hovered, pressed }: any) => [
                styles.premiumCard,
                hovered && styles.premiumCardHovered,
                pressed && styles.premiumCardPressed,
              ]}
            >
              <View style={styles.premiumTopGlow} />
              <View style={styles.countdownPill}>
                <Clock size={14} color={Palette.gold} />
                <Text style={styles.countdownText}>Chegirma tugashiga: {countdown}</Text>
              </View>

              <View style={styles.premiumHeader}>
                <View style={styles.premiumIntro}>
                  <View style={styles.discountBadge}>
                    <Sparkles size={12} color={Palette.black} fill={Palette.black} />
                    <Text style={styles.discountBadgeText}>Chegirmadagi narx</Text>
                  </View>
                  <Text style={styles.premiumName}>Premium</Text>
                  <Text style={styles.premiumSubtitle}>
                    {"Cheksiz o'qish va eksklyuziv imkoniyatlar"}
                  </Text>
                </View>

                <View style={styles.priceBlock}>
                  <Text style={styles.oldPrice}>{"40 000 so'm"}</Text>
                  <View style={styles.priceLine}>
                    <Text style={styles.mainPrice}>{"24 000 so'm"}</Text>
                    <Text style={styles.pricePeriod}>/ oy</Text>
                  </View>
                </View>
              </View>

              <View style={styles.perksList}>
                {PREMIUM_FEATURES.map((feature) => (
                  <View key={feature} style={styles.perkRow}>
                    <View style={styles.perkDot}>
                      <Check size={11} color={Palette.white} />
                    </View>
                    <Text style={styles.perkText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          </Animated.View>
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

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: footerPaddingBottom }]}>
        {isPremiumActive ? (
          <View style={[styles.cta, styles.ctaActive]}>
            <Crown size={18} color={Palette.white} fill={Palette.white} />
            <Text style={styles.ctaText}>Premium faol</Text>
          </View>
        ) : (
          <Animated.View
            style={[
              styles.ctaPulseShell,
              {
                shadowOpacity: ctaShadowOpacity,
                shadowRadius: ctaShadowRadius,
                transform: [{ scale: ctaPulseScale }],
              } as any,
              paymentLoading && { opacity: 0.7 },
            ]}
          >
            <Pressable
              onPress={onSubscribe}
              style={({ hovered, pressed }: any) => [
                styles.cta,
                hovered && styles.ctaHovered,
                pressed && styles.ctaPressed,
              ]}
              disabled={paymentLoading}
              testID="sub-cta"
            >
              {paymentLoading ? (
                <ActivityIndicator color={Palette.white} />
              ) : (
                <Text style={styles.ctaText}>{"Premium obuna bo'lish"}</Text>
              )}
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Palette.cream },
  topBar: { paddingHorizontal: 16, alignItems: "flex-end" },
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
  singlePlanWrap: { marginTop: 24 },
  premiumGlowShell: {
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: "#090909",
    shadowColor: Palette.red,
    shadowOffset: { width: 0, height: 0 },
    elevation: 18,
    ...Platform.select({
      web: {
        boxShadow: "0 18px 46px rgba(237,28,36,0.22)",
      } as any,
    }),
  },
  premiumCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#090909",
    padding: 20,
    transform: [{ scale: 1 }],
  },
  premiumCardHovered: {
    transform: [{ translateY: -2 }],
    ...Platform.select({
      web: {
        boxShadow: "0 24px 72px rgba(237,28,36,0.34)",
      } as any,
    }),
  },
  premiumCardPressed: {
    transform: [{ scale: 0.99 }],
  },
  premiumTopGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: Palette.red,
  },
  countdownPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.32)",
    backgroundColor: "rgba(245,197,66,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countdownText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "800",
  },
  premiumHeader: {
    flexDirection: "column",
    gap: 16,
    marginTop: 24,
  },
  premiumIntro: {
    flex: 0,
  },
  discountBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: Palette.gold,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  discountBadgeText: { fontSize: 11, fontWeight: "900", color: Palette.black },
  premiumName: {
    color: Palette.white,
    fontFamily: Fonts.serif,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 16,
  },
  premiumSubtitle: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  priceBlock: {
    alignItems: "flex-start",
  },
  oldPrice: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 14,
    fontWeight: "800",
    textDecorationLine: "line-through",
    marginBottom: 4,
  },
  priceLine: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 7,
  },
  mainPrice: {
    color: Palette.white,
    fontFamily: Fonts.serif,
    fontSize: 34,
    fontWeight: "900",
  },
  pricePeriod: {
    color: Palette.gold,
    fontSize: 15,
    fontWeight: "900",
    paddingBottom: 5,
  },
  perksList: { gap: 11, marginTop: 24 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  perkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
  },
  perkText: { color: Palette.white, fontSize: 14, lineHeight: 20, flex: 1 },
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
    paddingTop: 18,
    paddingHorizontal: 18,
    backgroundColor: Palette.cream,
    borderTopWidth: 1,
    borderTopColor: "#ECE6D8",
  },
  ctaPulseShell: {
    borderRadius: 8,
    shadowColor: Palette.red,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
    ...Platform.select({
      web: {
        boxShadow: "0 10px 34px rgba(237,28,36,0.34)",
      } as any,
    }),
  },
  cta: {
    backgroundColor: Palette.red,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    transform: [{ scale: 1 }],
  },
  ctaActive: {
    backgroundColor: "#22a055",
    opacity: 1,
  },
  ctaHovered: {
    backgroundColor: Palette.redDark,
    ...Platform.select({
      web: {
        boxShadow: "0 14px 40px rgba(237,28,36,0.42)",
      } as any,
    }),
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
  },
  ctaText: { color: Palette.white, fontWeight: "900", fontSize: 15 },
});
