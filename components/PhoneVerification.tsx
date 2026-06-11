import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CheckCircle2, MessageSquareText, ShieldCheck } from "lucide-react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { normalizePhoneValue, sendPhoneLinkCode, verifyPhoneLinkCode } from "@/lib/auth";
import type { TelegramPhoneSession } from "@/lib/telegramAuth";
import type { UserProfile } from "@/lib/types";
import { useColors } from "@/utils/useColors";

const DEFAULT_PHONE = "+998";

type PhoneVerificationProps = {
  userId: string;
  initialPassword?: string | null;
  initialPhone?: string | null;
  onVerified: (user: UserProfile) => void;
  onSkip?: () => void;
};

export function PhoneVerification({ userId, initialPassword = null, initialPhone = null, onVerified, onSkip }: PhoneVerificationProps) {
  const colors = useColors();
  const [phone, setPhone] = useState(initialPhone || DEFAULT_PHONE);
  const [currentPassword, setCurrentPassword] = useState(initialPassword ?? "");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<TelegramPhoneSession | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const needsPassword = !initialPassword;
  const phoneReady = useMemo(() => phone.replace(/\D/g, "").length >= 12, [phone]);

  const handleSendCode = useCallback(async () => {
    setSendLoading(true);
    setError("");
    setStatusMessage("");

    try {
      if (!phoneReady) {
        throw new Error("Telefon raqamini +998 formatida kiriting");
      }

      if (!currentPassword.trim()) {
        throw new Error("Joriy parolni kiriting");
      }

      const nextSession = await sendPhoneLinkCode({
        phone,
        userId,
        currentPassword,
      });

      setSession(nextSession);
      setPhone(nextSession.phone);
      setStatusMessage("SMS kod yuborildi");
      setCode("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "SMS kod yuborilmadi");
    } finally {
      setSendLoading(false);
    }
  }, [currentPassword, phone, phoneReady, userId]);

  const handleVerifyCode = useCallback(async () => {
    if (!session) {
      return;
    }

    setVerifyLoading(true);
    setError("");
    setStatusMessage("");

    try {
      if (code.length !== 6) {
        throw new Error("Tasdiqlash kodi 6 ta raqam bo'lishi kerak");
      }

      const user = await verifyPhoneLinkCode(session.session_id, code, session.phone);
      onVerified(user);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Telefon raqami biriktirilmadi");
    } finally {
      setVerifyLoading(false);
    }
  }, [code, onVerified, session]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
      <View style={styles.iconWrap}>
        <ShieldCheck size={22} color={Palette.white} />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>Hisobingizni yo‘qotib qo‘ymaslik uchun telefon raqamingizni biriktiring</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Telefon raqami profilni tiklash va keyinchalik xavfsiz kirish uchun ishlatiladi.</Text>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Telefon raqami</Text>
        <TextInput
          value={phone}
          onChangeText={(value) => setPhone(normalizePhoneValue(value))}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="phone-pad"
          placeholder="+998 90 123 45 67"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
        />
      </View>

      {needsPassword ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Joriy parol</Text>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder="Joriy parol"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
          />
        </View>
      ) : null}

      <Pressable
        onPress={handleSendCode}
        disabled={sendLoading}
        style={({ pressed }) => [styles.primaryButton, (pressed || sendLoading) && styles.primaryButtonPressed]}
      >
        {sendLoading ? <ActivityIndicator color={Palette.white} /> : <MessageSquareText size={18} color={Palette.white} />}
        <Text style={styles.primaryButtonText}>Kod yuborish</Text>
      </Pressable>

      {session ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>6 xonali kod</Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
          />

          <Pressable
            onPress={handleVerifyCode}
            disabled={verifyLoading}
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border }, (pressed || verifyLoading) && styles.secondaryButtonPressed]}
          >
            {verifyLoading ? <ActivityIndicator color={Palette.red} /> : <CheckCircle2 size={18} color={Palette.red} />}
            <Text style={styles.secondaryButtonText}>Kodni tasdiqlash</Text>
          </Pressable>
        </View>
      ) : null}

      {statusMessage ? <Text style={styles.successText}>{statusMessage}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {onSkip ? (
        <Pressable onPress={onSkip} style={styles.skipButton}>
          <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>{"Hozircha o'tkazib yuborish"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    padding: 22,
    shadowColor: Palette.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 5,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: Palette.red,
    borderRadius: 18,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: 22,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    fontFamily: Fonts.sans,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: Palette.red,
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 18,
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  primaryButtonText: {
    color: Palette.white,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 18,
  },
  secondaryButtonPressed: {
    opacity: 0.86,
  },
  secondaryButtonText: {
    color: Palette.red,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "700",
  },
  successText: {
    color: "#1c7c36",
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  errorText: {
    color: Palette.red,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  skipButton: {
    alignSelf: "center",
    paddingVertical: 4,
  },
  skipButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "600",
  },
});