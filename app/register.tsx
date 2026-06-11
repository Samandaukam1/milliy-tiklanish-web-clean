import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import { ArrowLeft, CalendarDays, ImagePlus, UserRound } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { InterestSelector } from "@/components/InterestSelector";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { normalizeLoginValue, registerUser, validatePassword } from "@/lib/auth";
import { fetchCategories } from "@/lib/services";
import type { AppCategory } from "@/lib/types";
import { useApp } from "@/providers/AppProvider";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";

type FormErrors = {
  avatar?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  login?: string;
  email?: string;
  password?: string;
  interests?: string;
  general?: string;
};

function normalizeBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function isValidBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value && parsed.getTime() <= Date.now();
}

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { language } = useLanguage();
  const { login, stagePhoneLinkPassword } = useApp();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loginValue, setLoginValue] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [password, setPassword] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    let isActive = true;
    setCategoriesLoading(true);

    fetchCategories(language as never)
      .then((items) => {
        if (isActive) {
          setCategories(items);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrors((prev) => ({ ...prev, general: "Qiziqishlar ro'yxatini yuklab bo'lmadi" }));
        }
      })
      .finally(() => {
        if (isActive) {
          setCategoriesLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [language]);

  const toggleInterest = useCallback((categoryId: string) => {
    setSelectedInterests((prev) => {
      const next = prev.includes(categoryId) ? prev.filter((item) => item !== categoryId) : [...prev, categoryId];
      return next;
    });
    setErrors((prev) => ({ ...prev, interests: undefined, general: undefined }));
  }, []);

  const handlePickAvatar = useCallback(async () => {
    setAvatarLoading(true);
    setErrors((prev) => ({ ...prev, avatar: undefined, general: undefined }));

    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Profil rasmi uchun galereyaga ruxsat kerak");
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      setAvatarUrl(asset.base64 ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}` : asset.uri);
    } catch (pickError) {
      setErrors((prev) => ({
        ...prev,
        avatar: pickError instanceof Error ? pickError.message : "Profil rasmini tanlab bo'lmadi",
      }));
    } finally {
      setAvatarLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) {
      return;
    }

    const nextErrors: FormErrors = {};
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const normalizedLogin = normalizeLoginValue(loginValue);
    const trimmedEmail = emailValue.trim().toLowerCase();
    const passwordError = validatePassword(password);

    if (!avatarUrl) {
      nextErrors.avatar = "Profil rasmi majburiy";
    }
    if (!trimmedFirstName) {
      nextErrors.firstName = "Ismingizni kiriting";
    }
    if (!trimmedLastName) {
      nextErrors.lastName = "Familiyangizni kiriting";
    }
    if (!isValidBirthDate(birthDate)) {
      nextErrors.birthDate = "Tug'ilgan sanani YYYY-MM-DD formatida kiriting";
    }
    if (!normalizedLogin || normalizedLogin.length < 3) {
      nextErrors.login = "Login kamida 3 ta belgidan iborat bo'lishi kerak";
    }
    if (!trimmedEmail || !trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      nextErrors.email = "Email manzil noto'g'ri. Iltimos haqiqiy email kiriting.";
    }
    if (passwordError) {
      nextErrors.password = passwordError;
    }
    if (selectedInterests.length < 3) {
      nextErrors.interests = "Kamida 3 ta qiziqish tanlang";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      console.log("[register] selectedInterests", selectedInterests);

      const profile = await registerUser({
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        birth_date: birthDate,
        login: normalizedLogin,
        email: emailValue.trim().toLowerCase(),
        password,
        interests: selectedInterests,
        avatar_url: avatarUrl,
      });

      login(profile);
      stagePhoneLinkPassword(password);
      router.replace("/phone-verification?source=register");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Ro'yxatdan o'tish yakunlanmadi";
      if (message === "Bu email yoki login band yoki avval ishlatilgan") {
        setErrors({ login: message });
      } else if (message === "Email manzil noto'g'ri. Iltimos haqiqiy email kiriting.") {
        setErrors({ email: message });
      } else if (message === "Bu login band yoki avval ishlatilgan") {
        setErrors({ login: message });
      } else if (message === "Kamida 3 ta qiziqish tanlang") {
        setErrors({ interests: message });
      } else {
        setErrors({ general: message });
      }
    } finally {
      setSubmitting(false);
    }
  }, [avatarUrl, birthDate, emailValue, firstName, lastName, login, loginValue, password, selectedInterests, stagePhoneLinkPassword, submitting]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable onPress={() => router.back()} style={[styles.backButton, { top: insets.top + 12 }]}> 
        <ArrowLeft size={20} color={colors.text} />
      </Pressable>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 84, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>{"Ro'yxatdan o'tish"}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{"Profilingizni yarating, qiziqishlaringizni tanlang va keyin telefon raqamingizni biriktiring."}</Text>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <View style={styles.avatarSection}>
                <Pressable onPress={handlePickAvatar} style={[styles.avatarButton, { backgroundColor: colors.background, borderColor: colors.border }]}> 
                  {avatarUrl ? (
                    <ExpoImage source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <UserRound size={26} color={Palette.beige} />
                      <ImagePlus size={18} color={Palette.red} />
                    </View>
                  )}
                </Pressable>
                <View style={styles.avatarTextWrap}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Profil rasmi</Text>
                  <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>Rasmingiz hisobingizni tez tanish uchun ishlatiladi.</Text>
                  {avatarLoading ? <ActivityIndicator color={Palette.red} /> : null}
                  {errors.avatar ? <Text style={styles.errorText}>{errors.avatar}</Text> : null}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Ism</Text>
                <TextInput
                  value={firstName}
                  onChangeText={(value) => {
                    setFirstName(value);
                    setErrors((prev) => ({ ...prev, firstName: undefined, general: undefined }));
                  }}
                  placeholder="Ism"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                />
                {errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Familiya</Text>
                <TextInput
                  value={lastName}
                  onChangeText={(value) => {
                    setLastName(value);
                    setErrors((prev) => ({ ...prev, lastName: undefined, general: undefined }));
                  }}
                  placeholder="Familiya"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                />
                {errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>{"Tug'ilgan sana"}</Text>
                <View style={[styles.dateField, { backgroundColor: colors.background, borderColor: colors.border }]}> 
                  <TextInput
                    value={birthDate}
                    onChangeText={(value) => {
                      setBirthDate(normalizeBirthDateInput(value));
                      setErrors((prev) => ({ ...prev, birthDate: undefined, general: undefined }));
                    }}
                    keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "number-pad"}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.dateInput, { color: colors.text }]}
                  />
                  <CalendarDays size={18} color={Palette.red} />
                </View>
                <Text style={[styles.passwordHint, { color: colors.textSecondary }]}>YYYY-MM-DD formatida kiriting. Masalan: 1998-05-03</Text>
                {errors.birthDate ? <Text style={styles.errorText}>{errors.birthDate}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Login</Text>
                <TextInput
                  value={loginValue}
                  onChangeText={(value) => {
                    setLoginValue(normalizeLoginValue(value));
                    setErrors((prev) => ({ ...prev, login: undefined, general: undefined }));
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="login"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                />
                {errors.login ? <Text style={styles.errorText}>{errors.login}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Email</Text>
                <TextInput
                  value={emailValue}
                  onChangeText={(value) => {
                    setEmailValue(value.trim());
                    setErrors((prev) => ({ ...prev, email: undefined, general: undefined }));
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="email@example.com"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                />
                <Text style={[styles.passwordHint, { color: colors.textSecondary }]}>Akkauntingizni tiklash va bildirishnomalar uchun ishlatiladi.</Text>
                {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Parol</Text>
                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setErrors((prev) => ({ ...prev, password: undefined, general: undefined }));
                  }}
                  secureTextEntry
                  placeholder="Parol"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                />
                <Text style={[styles.passwordHint, { color: colors.textSecondary }]}>{"Parol kamida 6 ta belgidan iborat bo'lsin va unda harf ham raqam ham bo'lsin."}</Text>
                {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
              </View>

              {categoriesLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={Palette.red} />
                  <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>Qiziqishlar yuklanmoqda...</Text>
                </View>
              ) : (
                <InterestSelector categories={categories} selectedIds={selectedInterests} onToggle={toggleInterest} error={errors.interests} />
              )}

              {errors.general ? <Text style={styles.errorText}>{errors.general}</Text> : null}

              <Pressable onPress={handleSubmit} disabled={submitting} style={({ pressed }) => [styles.primaryButton, (pressed || submitting) && styles.pressed]}> 
                {submitting ? <ActivityIndicator color={Palette.white} /> : <Text style={styles.primaryButtonText}>Akkount yaratish</Text>}
              </Pressable>

              <Pressable onPress={() => router.push({ pathname: "/login", params: { mode: "signin" } })} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border }, pressed && styles.pressed]}> 
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Mening akkountim bor</Text>
              </Pressable>
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
  backButton: {
    alignItems: "center",
    backgroundColor: Palette.white,
    borderColor: Palette.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    left: 20,
    position: "absolute",
    width: 44,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  content: {
    alignSelf: "center",
    gap: 18,
    maxWidth: 620,
    width: "100%",
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: 32,
    lineHeight: 40,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  card: {
    borderRadius: 30,
    borderWidth: 1,
    gap: 16,
    padding: 24,
    shadowColor: Palette.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 5,
  },
  avatarSection: {
    flexDirection: "row",
    gap: 16,
  },
  avatarButton: {
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    height: 108,
    justifyContent: "center",
    overflow: "hidden",
    width: 108,
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  avatarPlaceholder: {
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  avatarTextWrap: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: 20,
    lineHeight: 26,
  },
  sectionBody: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
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
    minHeight: 54,
    paddingHorizontal: 16,
  },
  dateField: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 16,
  },
  dateInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  passwordHint: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: Palette.red,
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: Palette.white,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.88,
  },
  errorText: {
    color: Palette.red,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
});