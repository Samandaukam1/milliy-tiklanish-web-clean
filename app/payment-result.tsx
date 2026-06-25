import { router, Stack, useLocalSearchParams } from "expo-router";
import { CheckCircle, Clock, XCircle } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { useApp, type Subscription } from "@/providers/AppProvider";
import { getPaymentStatus, type PaymentType } from "@/lib/payments";
import { useColors } from "@/utils/useColors";

type PollStatus = "loading" | "paid" | "failed" | "pending" | "cancelled";

const MAX_POLL_ATTEMPTS = 15; // 15 × 2 s = 30 s

function normalizePaymentPlan(value: string | null | undefined): Subscription {
  if (value === "premium") {
    return "premium";
  }

  if (value === "pro" || value === "vip") {
    return "pro";
  }

  return "free";
}

export default function PaymentResultScreen() {
  const { payment_id, tier, type, article_id } = useLocalSearchParams<{
    payment_id: string;
    tier: string;
    type?: PaymentType;
    article_id?: string;
  }>();
  const { updateSubscription } = useApp();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [pollStatus, setPollStatus] = useState<PollStatus>("loading");
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    if (!payment_id) {
      setPollStatus("failed");
      return;
    }

    try {
      const result = await getPaymentStatus(payment_id);
      console.log(
        "[PaymentResult] status:", result.status,
        "| attempt:", attemptsRef.current,
        "| payment_id:", payment_id
      );

      if (result.status === "paid") {
        setPollStatus("paid");
        const nextPlan = normalizePaymentPlan(typeof tier === "string" ? tier : result.tier);
        if (result.type === "subscription" && nextPlan !== "free") {
          updateSubscription(result.subscription_info ?? nextPlan);
        }
      } else if (result.status === "cancelled") {
        setPollStatus("cancelled");
      } else if (result.status === "failed") {
        setPollStatus("failed");
      } else {
        // Still pending
        if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
          setPollStatus("pending");
        } else {
          attemptsRef.current += 1;
          timerRef.current = setTimeout(poll, 2000);
        }
      }
    } catch (e) {
      console.warn("[PaymentResult] poll error:", e);
      if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setPollStatus("pending");
      } else {
        attemptsRef.current += 1;
        timerRef.current = setTimeout(poll, 2000);
      }
    }
  }, [payment_id, tier, updateSubscription]);

  useEffect(() => {
    poll();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  const retryPoll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    attemptsRef.current = 0;
    setPollStatus("loading");
    poll();
  }, [poll]);

  const normalizedType = (typeof type === "string" ? type : undefined) ?? undefined;
  const normalizedArticleId = typeof article_id === "string" ? article_id : undefined;
  const retryRoute = normalizedType === "article" && normalizedArticleId
    ? `/article/${normalizedArticleId}`
    : "/subscribe";

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.background, paddingTop: insets.top + 20, paddingBottom: insets.bottom },
      ]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Loading ── */}
      {pollStatus === "loading" && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Palette.red} />
          <Text style={[styles.title, { color: colors.text }]}>
            {"To'lov tekshirilmoqda..."}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Iltimos kuting. Bu 30 soniyagacha davom etishi mumkin.
          </Text>
        </View>
      )}

      {/* ── Paid ── */}
      {pollStatus === "paid" && (
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: "#E6F9F0" }]}>
            <CheckCircle size={48} color="#22C55E" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {"To'lov muvaffaqiyatli!"}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {normalizedType === "article"
              ? "Maqola xaridi tasdiqlandi. Premium maqola endi siz uchun ochiq."
              : "Obunangiz faollashtirildi.\nBarcha premium maqolalardan bahramand bo'ling."}
          </Text>
          <Pressable
            style={styles.btn}
            onPress={() => {
              if (normalizedType === "article" && normalizedArticleId) {
                router.replace(`/article/${normalizedArticleId}`);
                return;
              }

              router.replace("/");
            }}
          >
            <Text style={styles.btnText}>
              {normalizedType === "article" && normalizedArticleId
                ? "Maqolani ochish"
                : "Asosiy sahifaga qaytish"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.btnSecondary}
            onPress={() => router.replace("/(tabs)/profile" as any)}
          >
            <Text style={[styles.btnSecondaryText, { color: colors.textSecondary }]}>
              Profilga o'tish
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Failed ── */}
      {pollStatus === "failed" && (
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: "#FEF2F2" }]}>
            <XCircle size={48} color={Palette.red} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {"To'lov amalga oshmadi"}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {"Afsuski to'lovda xatolik yuz berdi.\nQayta urinib ko'ring yoki boshqa to'lov usulini tanlang."}
          </Text>
          <Pressable
            style={styles.btn}
            onPress={() => router.replace(retryRoute as any)}
          >
            <Text style={styles.btnText}>Qayta urinish</Text>
          </Pressable>
          <Pressable style={styles.btnSecondary} onPress={() => router.replace("/")}>
            <Text style={[styles.btnSecondaryText, { color: colors.textSecondary }]}>
              Asosiy sahifaga qaytish
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Still pending after timeout ── */}
      {pollStatus === "pending" && (
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: "#FFFBEB" }]}>
            <Clock size={48} color="#F59E0B" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {"To'lov tasdiqlanmoqda"}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {"To'lovingiz hali tasdiqlanmadi.\nBir necha daqiqadan so'ng qayta tekshiring."}
          </Text>
          <Pressable style={styles.btn} onPress={retryPoll}>
            <Text style={styles.btnText}>Qayta tekshirish</Text>
          </Pressable>
          <Pressable style={styles.btnSecondary} onPress={() => router.replace("/")}>
            <Text style={[styles.btnSecondaryText, { color: colors.textSecondary }]}>
              Asosiy sahifaga qaytish
            </Text>
          </Pressable>
        </View>
      )}

      {pollStatus === "cancelled" && (
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: "#FFF7ED" }]}> 
            <XCircle size={48} color="#F97316" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}> 
            {"To'lov bekor qilindi"}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}> 
            {"To'lov yakunlanmadi. Xohlasangiz, qayta urinib ko'rishingiz mumkin."}
          </Text>
          <Pressable style={styles.btn} onPress={() => router.replace(retryRoute as any)}>
            <Text style={styles.btnText}>Qayta urinish</Text>
          </Pressable>
          <Pressable style={styles.btnSecondary} onPress={() => router.replace("/")}> 
            <Text style={[styles.btnSecondaryText, { color: colors.textSecondary }]}> 
              Asosiy sahifaga qaytish
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  iconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  sub: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 32,
  },
  btn: {
    backgroundColor: Palette.red,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnSecondary: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  btnSecondaryText: { fontSize: 14, fontWeight: "600" },
});
