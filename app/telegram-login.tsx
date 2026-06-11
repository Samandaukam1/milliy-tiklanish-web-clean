import { router, Stack, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ImagePlus, KeyRound, RefreshCcw, UserRound } from "lucide-react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import {
  loginWithTelegramPassword,
  registerTelegramAccount,
  resetTelegramPassword,
  type TelegramSendResult,
  sendTelegramVerificationCode,
  type TelegramPhoneSession,
  type TelegramVerifyResult,
  verifyTelegramCode,
} from "@/lib/telegramAuth";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";

type AuthMode = "register" | "login" | "recovery" | "change-phone";

const DEFAULT_PHONE = "+998";
const ACCOUNT_NOTE = "Akkauntingizni yo‘qotmaslik uchun login va parolingizni saqlab qo‘ying yoki ushbu sahifani screenshot qilib qo‘ying.";
const TELEGRAM_FLOW_STORAGE_KEY = "mt.telegram.gateway.flow.v1";

type PersistedTelegramFlow = {
  mode: AuthMode;
  phone: string;
  session: TelegramPhoneSession | null;
  verificationResult: TelegramVerifyResult | null;
};

async function persistTelegramFlow(flow: PersistedTelegramFlow | null): Promise<void> {
  if (!flow) {
    await AsyncStorage.removeItem(TELEGRAM_FLOW_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(TELEGRAM_FLOW_STORAGE_KEY, JSON.stringify(flow));
}

async function readPersistedTelegramFlow(): Promise<PersistedTelegramFlow | null> {
  const raw = await AsyncStorage.getItem(TELEGRAM_FLOW_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PersistedTelegramFlow;
  } catch {
    await AsyncStorage.removeItem(TELEGRAM_FLOW_STORAGE_KEY);
    return null;
  }
}

function getPurposeForMode(mode: AuthMode): TelegramPhoneSession["purpose"] | null {
  if (mode === "register") {
    return "signup";
  }

  if (mode === "recovery") {
    return "recovery";
  }

  if (mode === "change-phone") {
    return "change_phone";
  }

  return null;
}

export default function TelegramLoginScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { login, user } = useApp();
  const forcedMode: AuthMode | null = params.mode === "change-phone" ? "change-phone" : null;
  const [mode, setMode] = useState<AuthMode>(forcedMode ?? "register");
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [code, setCode] = useState("");
  const [session, setSession] = useState<TelegramPhoneSession | null>(null);
  const [verificationResult, setVerificationResult] = useState<TelegramVerifyResult | null>(null);
  const [loginValue, setLoginValue] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [registerLogin, setRegisterLogin] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [recoveryPassword, setRecoveryPasswordValue] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [phoneExistsWarning, setPhoneExistsWarning] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (forcedMode) {
      setMode(forcedMode);
    }
  }, [forcedMode]);

  useEffect(() => {
    setPhone(DEFAULT_PHONE);
    setCode("");
    setSession(null);
    setVerificationResult(null);
    setFirstName("");
    setLastName("");
    setBirthDate("");
    setRegisterLogin("");
    setRegisterPassword("");
    setAvatarUrl(null);
    setPhoneExistsWarning(false);
    setError("");
    setStatusMessage("");
    if (mode !== "change-phone") {
      setCurrentPassword("");
    }
    if (mode !== "recovery") {
      setRecoveryPasswordValue("");
    }
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    readPersistedTelegramFlow()
      .then((persisted) => {
        if (!persisted || cancelled) {
          return;
        }

        const currentPurpose = getPurposeForMode(mode);
        if (!currentPurpose || !persisted.session || persisted.session.purpose !== currentPurpose) {
          return;
        }

        if (persisted.session.expires_at && new Date(persisted.session.expires_at).getTime() <= Date.now()) {
          void persistTelegramFlow(null);
          return;
        }

        setPhone(persisted.phone || persisted.session.phone);
        setSession(persisted.session);
        setVerificationResult(persisted.verificationResult);
        if (persisted.verificationResult?.phone_verified) {
          setStatusMessage(
            mode === "register"
              ? "Telefon tasdiqlandi. Endi ro'yxatdan o'tish ma'lumotlarini to'ldiring."
              : persisted.verificationResult.next_step === "reset_password"
                ? "Kod tasdiqlandi. Endi yangi parol kiriting."
                : ""
          );
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const formatTelegramError = useCallback((err: unknown) => {
    if (!(err instanceof Error)) {
      return "Server bilan bog‘lanishda xatolik";
    }

    if (err.message.startsWith("Server returned non-JSON") || /network request failed|failed to fetch/i.test(err.message)) {
      return "Server bilan bog‘lanishda xatolik";
    }

    if (err.message === "session_not_found") {
      return "Tasdiqlash sessiyasi topilmadi. Qayta kod so'rang.";
    }

    if (err.message === "request_id_missing") {
      return "Tasdiqlash sessiyasi buzilgan. Qayta kod so'rang.";
    }

    return err.message || "Server bilan bog‘lanishda xatolik";
  }, []);

  const setModeAndReset = useCallback((nextMode: AuthMode) => {
    setMode(nextMode);
  }, []);

  const screenMeta = useMemo(() => {
    switch (mode) {
      case "login":
        return {
          badge: <KeyRound size={30} color={Palette.white} />,
          title: "Login va parol bilan kirish",
          subtitle: "Avval yaratilgan profilingizga login va parol orqali kiring.",
        };
      case "recovery":
        return {
          badge: <RefreshCcw size={30} color={Palette.white} />,
          title: "Parolni tiklash",
          subtitle: "Telefon raqamingizni Telegram kodi bilan tasdiqlang va yangi parol o'rnating.",
        };
      case "change-phone":
        return {
          badge: <RefreshCcw size={30} color={Palette.white} />,
          title: "Telefon raqamini almashtirish",
          subtitle: "Joriy parolni tasdiqlang, yangi telefon raqamingizga Telegram kodi yuboriladi.",
        };
      default:
        return {
          badge: <UserRound size={30} color={Palette.white} />,
          title: "Telegram Gateway ro'yxatdan o'tish",
          subtitle: "Avval telefonni tasdiqlang. Profil faqat ro'yxatdan o'tish formasi to'ldirilgandan keyin yaratiladi.",
        };
    }
  }, [mode]);

  const handlePhoneChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setPhone(DEFAULT_PHONE);
      return;
    }

    if (digits.startsWith("998")) {
      setPhone(`+${digits.slice(0, 12)}`);
      return;
    }

    setPhone(`+998${digits.slice(0, 9)}`);
  }, []);

  const handleBirthDateChange = useCallback((value: string) => {
    setBirthDate(value.replace(/[^\d-]/g, "").slice(0, 10));
  }, []);

  const handleCodeChange = useCallback((value: string) => {
    setCode(value.replace(/\D/g, "").slice(0, 6));
  }, []);

  const handleLoginChange = useCallback((value: string, setter: (next: string) => void) => {
    setter(value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32));
  }, []);

  const handlePickAvatar = useCallback(async () => {
    Keyboard.dismiss();
    setAvatarLoading(true);
    setError("");

    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError("Profil rasmi uchun galereyaga ruxsat kerak");
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      const nextAvatarUrl = asset.base64
        ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`
        : asset.uri;
      setAvatarUrl(nextAvatarUrl);
    } catch (err) {
      setError(formatTelegramError(err));
    } finally {
      setAvatarLoading(false);
    }
  }, [formatTelegramError]);

  const handleSendCode = useCallback(async () => {
    Keyboard.dismiss();
    setSendLoading(true);
    setError("");
    setStatusMessage("");
    setSession(null);
    setVerificationResult(null);
    setPhoneExistsWarning(false);

    try {
      const purpose = mode === "recovery" ? "recovery" : mode === "change-phone" ? "change_phone" : "signup";
      const sendResult = await sendTelegramVerificationCode(phone, {
        purpose,
        user_id: user?.id,
        current_password: currentPassword,
      });
      if (!sendResult.success) {
        await persistTelegramFlow(null);
        setPhone(sendResult.phone);
        setPhoneExistsWarning(true);
        setStatusMessage(sendResult.message);
        setCode("");
        return;
      }

      const nextSession = sendResult.session;
      setPhone(nextSession.phone);
      setSession(nextSession);
      console.log("SAVED SESSION ID:", nextSession.session_id);
      setCode("");
      setStatusMessage(`${nextSession.phone} raqamiga Telegram kodi yuborildi`);
      await persistTelegramFlow({
        mode,
        phone: nextSession.phone,
        session: nextSession,
        verificationResult: null,
      });
    } catch (err) {
      setError(formatTelegramError(err));
    } finally {
      setSendLoading(false);
    }
  }, [currentPassword, formatTelegramError, mode, phone, user?.id]);

  const handleVerifyCode = useCallback(async () => {
    if (!session) {
      return;
    }

    Keyboard.dismiss();
    setVerifyLoading(true);
    setError("");
    setStatusMessage("");

    try {
      console.log("VERIFY REQUEST:", { session_id: session.session_id, phone: session.phone, code });
      const result = await verifyTelegramCode(session.session_id, code, session.phone);
      if (result.next_step === "phone_changed") {
        if (!result.user) {
          throw new Error("Telefon yangilangan foydalanuvchi qaytmadi");
        }

        await persistTelegramFlow(null);
        login(result.user);
        router.replace("/(tabs)/profile");
        return;
      }

      setVerificationResult(result);
      await persistTelegramFlow({
        mode,
        phone: result.phone,
        session,
        verificationResult: result,
      });
      if (mode === "register") {
        setStatusMessage("Telefon tasdiqlandi. Endi ro'yxatdan o'tish ma'lumotlarini to'ldiring.");
      } else if (result.next_step === "reset_password") {
        setStatusMessage("Kod tasdiqlandi. Endi yangi parol kiriting.");
      }
    } catch (err) {
      setError(formatTelegramError(err));
    } finally {
      setVerifyLoading(false);
    }
  }, [code, formatTelegramError, login, session]);

  const handlePasswordLogin = useCallback(async () => {
    Keyboard.dismiss();
    setSubmitLoading(true);
    setError("");

    try {
      const profile = await loginWithTelegramPassword(loginValue, loginPassword);
      await persistTelegramFlow(null);
      login(profile);
      router.replace("/(tabs)/profile");
    } catch (err) {
      setError(formatTelegramError(err));
    } finally {
      setSubmitLoading(false);
    }
  }, [formatTelegramError, login, loginPassword, loginValue]);

  const handleRegister = useCallback(async () => {
    if (!verificationResult?.phone_verified || verificationResult.next_step) {
      return;
    }

    Keyboard.dismiss();
    setSubmitLoading(true);
    setError("");

    try {
      const profile = await registerTelegramAccount({
        session_id: verificationResult.session_id,
        phone: verificationResult.phone,
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        login: registerLogin,
        password: registerPassword,
        avatar_url: avatarUrl,
      });
      await persistTelegramFlow(null);
      login(profile);
      router.replace("/(tabs)/profile");
    } catch (err) {
      setError(formatTelegramError(err));
    } finally {
      setSubmitLoading(false);
    }
  }, [avatarUrl, birthDate, firstName, formatTelegramError, lastName, login, registerLogin, registerPassword, verificationResult]);

  const handleResetPassword = useCallback(async () => {
    if (!verificationResult || verificationResult.next_step !== "reset_password") {
      return;
    }

    Keyboard.dismiss();
    setSubmitLoading(true);
    setError("");

    try {
      const profile = await resetTelegramPassword(verificationResult.session_id, recoveryPassword);
      await persistTelegramFlow(null);
      login(profile);
      router.replace("/(tabs)/profile");
    } catch (err) {
      setError(formatTelegramError(err));
    } finally {
      setSubmitLoading(false);
    }
  }, [formatTelegramError, login, recoveryPassword, verificationResult]);

  const changePhoneLocked = forcedMode === "change-phone" && !user;
  const showRegistrationForm = mode === "register" && !!verificationResult?.phone_verified && !verificationResult.next_step;
  const showRecoveryForm = verificationResult?.next_step === "reset_password";
  const showRecoveryShortcut = phoneExistsWarning;

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 12 }]}>
        <ArrowLeft size={20} color={colors.text} />
      </Pressable>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.heroBadge}>
              {screenMeta.badge}
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{screenMeta.title}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{screenMeta.subtitle}</Text>

            {!forcedMode ? (
              <View style={[styles.modeTabs, { borderColor: colors.border, backgroundColor: colors.card }]}> 
                <ModeTab label="Ro'yxatdan o'tish" active={mode === "register"} onPress={() => setModeAndReset("register")} />
                <ModeTab label="Kirish" active={mode === "login"} onPress={() => setModeAndReset("login")} />
                <ModeTab label="Parolni tiklash" active={mode === "recovery"} onPress={() => setModeAndReset("recovery")} />
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              {mode === "login" ? (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.stepLabel, { color: colors.textMuted }]}>Kirish</Text>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>Login ma'lumotlarini kiriting</Text>
                  </View>

                  <TextInput
                    value={loginValue}
                    onChangeText={(value) => handleLoginChange(value, setLoginValue)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="login"
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  />

                  <TextInput
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    secureTextEntry
                    placeholder="Parol"
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  />

                  {!!error && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <Pressable
                    onPress={() => void handlePasswordLogin()}
                    disabled={submitLoading}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      (submitLoading || pressed) && styles.primaryBtnPressed,
                    ]}
                  >
                    {submitLoading ? <ActivityIndicator color={Palette.white} /> : <Text style={styles.primaryBtnText}>Tizimga kirish</Text>}
                  </Pressable>

                  <Pressable onPress={() => setModeAndReset("recovery")} style={styles.linkBtn}>
                    <Text style={[styles.linkText, { color: Palette.red }]}>Parolni unutdingizmi?</Text>
                  </Pressable>
                </>
              ) : changePhoneLocked ? (
                <View style={styles.centerState}>
                  <Text style={[styles.stepTitle, { color: colors.text }]}>Telefonni almashtirish uchun avval tizimga kiring</Text>
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>Bu sahifa faqat profil sozlamalaridan ochilganda ishlaydi.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.stepLabel, { color: colors.textMuted }]}>1-qadam</Text>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>{mode === "change-phone" ? "Yangi telefonni kiriting" : "Telefon raqamini kiriting"}</Text>
                  </View>

                  {mode === "change-phone" ? (
                    <TextInput
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry
                      placeholder="Joriy parol"
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.input,
                        {
                          color: colors.text,
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                  ) : null}

                  <TextInput
                    value={phone}
                    onChangeText={handlePhoneChange}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    placeholder="+998 90 123 45 67"
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  />

                  <Pressable
                    onPress={() => void handleSendCode()}
                    disabled={sendLoading || verifyLoading || submitLoading}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      (sendLoading || verifyLoading || submitLoading || pressed) && styles.primaryBtnPressed,
                    ]}
                  >
                    {sendLoading ? (
                      <ActivityIndicator color={Palette.white} />
                    ) : (
                      <Text style={styles.primaryBtnText}>{session ? "Kodni qayta yuborish" : "Kodni yuborish"}</Text>
                    )}
                  </Pressable>

                  {statusMessage ? (
                    <View style={showRecoveryShortcut ? styles.warningBox : styles.successBox}>
                      <Text style={showRecoveryShortcut ? styles.warningText : styles.successText}>{statusMessage}</Text>
                    </View>
                  ) : null}

                  {error ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  <View style={styles.sectionHeader}>
                    <Text style={[styles.stepLabel, { color: colors.textMuted }]}>2-qadam</Text>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>Tasdiqlash kodini kiriting</Text>
                  </View>

                  <TextInput
                    value={code}
                    onChangeText={handleCodeChange}
                    keyboardType="number-pad"
                    placeholder="6 xonali kod"
                    placeholderTextColor={colors.textMuted}
                    maxLength={6}
                    editable={!!session && !verifyLoading}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        opacity: session ? 1 : 0.65,
                      },
                    ]}
                  />

                  <Pressable
                    onPress={() => void handleVerifyCode()}
                    disabled={!session || verifyLoading || sendLoading || submitLoading}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                      (!session || verifyLoading || sendLoading || submitLoading || pressed) && styles.secondaryBtnPressed,
                    ]}
                  >
                    {verifyLoading ? (
                      <ActivityIndicator color={Palette.red} />
                    ) : (
                      <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Kodni tasdiqlash</Text>
                    )}
                  </Pressable>

                  {showRegistrationForm ? (
                    <>
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      <View style={styles.sectionHeader}>
                        <Text style={[styles.stepLabel, { color: colors.textMuted }]}>3-qadam</Text>
                        <Text style={[styles.stepTitle, { color: colors.text }]}>Profil ma'lumotlarini to'ldiring</Text>
                      </View>

                      <View style={[styles.avatarBlock, { borderColor: colors.border, backgroundColor: colors.background }]}> 
                        <View style={styles.avatarPreviewWrap}>
                          {avatarUrl ? (
                            <ExpoImage source={{ uri: avatarUrl }} style={styles.avatarPreviewImage} contentFit="cover" />
                          ) : (
                            <View style={[styles.avatarPreviewImage, styles.avatarPlaceholder]}>
                              <UserRound size={26} color={colors.textMuted} />
                            </View>
                          )}
                        </View>
                        <View style={styles.avatarMeta}>
                          <Text style={[styles.avatarTitle, { color: colors.text }]}>Profil rasmi</Text>
                          <Text style={[styles.avatarHint, { color: colors.textSecondary }]}>Ixtiyoriy. Rasm tanlanmasa, standart avatar ishlatiladi.</Text>
                          <Pressable
                            onPress={() => void handlePickAvatar()}
                            disabled={avatarLoading || submitLoading}
                            style={({ pressed }) => [
                              styles.avatarBtn,
                              { borderColor: colors.border, backgroundColor: colors.card },
                              (avatarLoading || submitLoading || pressed) && styles.secondaryBtnPressed,
                            ]}
                          >
                            {avatarLoading ? (
                              <ActivityIndicator color={Palette.red} />
                            ) : (
                              <>
                                <ImagePlus size={16} color={Palette.red} />
                                <Text style={[styles.avatarBtnText, { color: colors.text }]}>{avatarUrl ? "Rasmni almashtirish" : "Rasm tanlash"}</Text>
                              </>
                            )}
                          </Pressable>
                        </View>
                      </View>

                      <TextInput
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder="Ism"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                      />
                      <TextInput
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder="Familiya"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                      />
                      <TextInput
                        value={birthDate}
                        onChangeText={handleBirthDateChange}
                        placeholder="Tug'ilgan sana: YYYY-MM-DD"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                      />
                      <TextInput
                        value={registerLogin}
                        onChangeText={(value) => handleLoginChange(value, setRegisterLogin)}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="Login"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                      />
                      <TextInput
                        value={registerPassword}
                        onChangeText={setRegisterPassword}
                        secureTextEntry
                        placeholder="Parol"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                      />

                      <View style={[styles.noteBox, { backgroundColor: colors.background, borderColor: colors.border }]}> 
                        <Text style={[styles.noteText, { color: colors.textSecondary }]}>{ACCOUNT_NOTE}</Text>
                      </View>

                      <Pressable
                        onPress={() => void handleRegister()}
                        disabled={submitLoading || avatarLoading}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          (submitLoading || avatarLoading || pressed) && styles.primaryBtnPressed,
                        ]}
                      >
                        {submitLoading ? <ActivityIndicator color={Palette.white} /> : <Text style={styles.primaryBtnText}>Profil yaratish</Text>}
                      </Pressable>
                    </>
                  ) : null}

                  {showRecoveryForm ? (
                    <>
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      <View style={styles.sectionHeader}>
                        <Text style={[styles.stepLabel, { color: colors.textMuted }]}>3-qadam</Text>
                        <Text style={[styles.stepTitle, { color: colors.text }]}>Yangi parol o'rnating</Text>
                      </View>

                      <TextInput
                        value={recoveryPassword}
                        onChangeText={setRecoveryPasswordValue}
                        secureTextEntry
                        placeholder="Yangi parol"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                      />

                      <Pressable
                        onPress={() => void handleResetPassword()}
                        disabled={submitLoading}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          (submitLoading || pressed) && styles.primaryBtnPressed,
                        ]}
                      >
                        {submitLoading ? <ActivityIndicator color={Palette.white} /> : <Text style={styles.primaryBtnText}>Parolni yangilash</Text>}
                      </Pressable>
                    </>
                  ) : null}

                  {showRecoveryShortcut ? (
                    <View style={styles.actionRow}>
                      {!forcedMode ? (
                        <Pressable onPress={() => setModeAndReset("recovery")} style={[styles.inlineActionBtn, { borderColor: colors.border }]}> 
                          <Text style={[styles.inlineActionText, { color: colors.text }]}>Parolni tiklash</Text>
                        </Pressable>
                      ) : null}
                      {!forcedMode ? (
                        <Pressable onPress={() => setModeAndReset("login")} style={[styles.inlineActionBtn, { borderColor: colors.border }]}> 
                          <Text style={[styles.inlineActionText, { color: colors.text }]}>Login sahifasiga o'tish</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>Kod tasdiqlangandan keyin hisob avtomatik yaratilmaydi. Har bir flow alohida yakunlanadi.</Text>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
  },
  backBtn: {
    position: "absolute",
    left: 20,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 24,
  },
  heroBadge: {
    width: 74,
    height: 74,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1296DB",
    alignSelf: "center",
    marginBottom: 24,
  },
  modeTabs: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 6,
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 31,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 28,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    minHeight: 340,
    justifyContent: "center",
    overflow: "hidden",
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 220,
  },
  modeTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  avatarBlock: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },
  avatarPreviewWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPreviewImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(18,150,219,0.10)",
  },
  avatarMeta: {
    flex: 1,
    gap: 8,
    justifyContent: "center",
  },
  avatarTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  avatarHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  avatarBtn: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  avatarBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  sectionHeader: {
    gap: 2,
    marginBottom: 12,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 17,
    marginBottom: 14,
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: Palette.red,
    fontWeight: "600",
  },
  errorBox: {
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(237,28,36,0.08)",
    borderLeftWidth: 3,
    borderLeftColor: Palette.red,
  },
  successBox: {
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(18,150,219,0.10)",
    borderLeftWidth: 3,
    borderLeftColor: "#1296DB",
  },
  successText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#0E6A9E",
    fontWeight: "700",
  },
  noteBox: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 19,
  },
  warningBox: {
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(176,108,34,0.12)",
    borderLeftWidth: 3,
    borderLeftColor: "#B06C22",
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#8A4D07",
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginVertical: 18,
  },
  primaryBtnPressed: {
    opacity: 0.75,
  },
  primaryBtnText: {
    color: Palette.white,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryBtn: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryBtnPressed: {
    opacity: 0.7,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  linkBtn: {
    marginTop: 12,
    alignSelf: "center",
  },
  linkText: {
    fontSize: 14,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  inlineActionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  inlineActionText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
});

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeTab,
        {
          backgroundColor: active ? Palette.red : "transparent",
          opacity: pressed && !active ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.modeTabText, { color: active ? Palette.white : Palette.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}