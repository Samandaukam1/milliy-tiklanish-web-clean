'use client';
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle,
  ChevronDown,
  FileText,
  Loader,
  Phone,
  Send,
  User,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { supabase } from "@/lib/supabase";
import { fetchCategories } from "@/lib/services";
import { useLanguage } from "@/providers/LanguageProvider";
import { useColors } from "@/utils/useColors";

// ─── Category ──────────────────────────────────────────────────────────────
interface Category {
  id: string;
  name: string;
}

// ─── Form state ────────────────────────────────────────────────────────────
interface FormState {
  title: string;
  cover_url: string;
  category_id: string;
  anons: string;
  body: string;
  author_name: string;
  author_bio: string;
  phone: string;
  telegram: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  cover_url: "",
  category_id: "",
  anons: "",
  body: "",
  author_name: "",
  author_bio: "",
  phone: "",
  telegram: "",
};

type FieldError = Partial<Record<keyof FormState, string>>;

// ─── Helpers ────────────────────────────────────────────────────────────────
async function uploadCoverImage(
  uri: string,
  fileName: string
): Promise<string> {
  const ext = fileName.split(".").pop() ?? "jpg";
  const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  console.log("[submit-article] bucket:", "reader-submissions");

  if (Platform.OS === "web") {
    // On web, fetch the blob from the object URL
    const res = await fetch(uri);
    const blob = await res.blob();
    const { error } = await supabase.storage
      .from("reader-submissions")
      .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
  } else {
    // On native, use base64
    const res = await fetch(uri);
    const blob = await res.blob();
    const { error } = await supabase.storage
      .from("reader-submissions")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
  }

  const { data } = supabase.storage.from("reader-submissions").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Category Picker Modal ───────────────────────────────────────────────────
function CategoryPicker({
  visible,
  categories,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.backdrop} onPress={onClose} />
      <View style={[pickerStyles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={pickerStyles.handle} />
        <Text style={[pickerStyles.title, { color: colors.text }]}>Bo'lim tanlang</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => { onSelect(cat.id); onClose(); }}
              style={[
                pickerStyles.option,
                { borderColor: colors.border },
                cat.id === selected && { backgroundColor: "rgba(237,28,36,0.06)" },
              ]}
            >
              <Text style={[pickerStyles.optionText, { color: colors.text }, cat.id === selected && { color: Palette.red, fontWeight: "700" }]}>
                {cat.name}
              </Text>
              {cat.id === selected && (
                <CheckCircle size={18} color={Palette.red} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "70%",
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D0C8BC",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    marginBottom: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  optionText: { fontSize: 15, fontWeight: "500" },
});

// ─── Field wrapper ────────────────────────────────────────────────────────
function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>
        {label}
        {required && <Text style={fieldStyles.required}> *</Text>}
      </Text>
      {children}
      {!!error && (
        <View style={fieldStyles.errorRow}>
          <AlertCircle size={13} color="#E53E3E" />
          <Text style={fieldStyles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: Palette.beige, letterSpacing: 1, textTransform: "uppercase" },
  required: { color: Palette.red },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  errorText: { fontSize: 12, color: "#E53E3E" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────
export default function SubmitArticlePage() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { language } = useLanguage();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldError>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [coverLocalUri, setCoverLocalUri] = useState<string | null>(null);
  const [coverFileName, setCoverFileName] = useState<string>("");
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Load categories
  useEffect(() => {
    fetchCategories(language as any)
      .then((cats) => setCategories(cats.map((c) => ({ id: String(c.id), name: c.name }))))
      .catch(() => {});
  }, [language]);

  // Helper to update a single field
  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const pickCover = useCallback(async () => {
    if (Platform.OS === "web") {
      // Web: use a file input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setCoverLocalUri(url);
        setCoverFileName(file.name);
        setErrors((prev) => ({ ...prev, cover_url: undefined }));
      };
      input.click();
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Ruxsat kerak", "Foto galereya ruxsatini bering.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCoverLocalUri(asset.uri);
      setCoverFileName(asset.fileName ?? `photo-${Date.now()}.jpg`);
      setErrors((prev) => ({ ...prev, cover_url: undefined }));
    }
  }, []);

  const validate = (): boolean => {
    const next: FieldError = {};
    if (!form.title.trim()) next.title = "Sarlavha kiritilishi shart";
    if (!form.category_id) next.category_id = "Bo'lim tanlanishi shart";
    if (!form.anons.trim()) next.anons = "Qisqa tavsif kiritilishi shart";
    if (!form.body.trim()) next.body = "Maqola matni kiritilishi shart";
    if (!form.author_name.trim()) next.author_name = "Muallif ismi kiritilishi shart";
    if (!form.phone.trim()) next.phone = "Telefon raqam kiritilishi shart";
    if (!form.telegram.trim()) next.telegram = "Telegram raqam yoki username kiritilishi shart";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setSubmitting(true);
    try {
      // Upload cover if a local file was selected
      let finalCoverUrl = form.cover_url;
      if (coverLocalUri) {
        finalCoverUrl = await uploadCoverImage(coverLocalUri, coverFileName);
      }

      const payload = {
        title: form.title.trim(),
        anons: form.anons.trim(),
        body: form.body.trim(),
        cover_url: finalCoverUrl || null,
        category_id: form.category_id || null,
        author_name: form.author_name.trim(),
        author_bio: form.author_bio.trim() || null,
        phone: form.phone.trim(),
        telegram: form.telegram.trim(),
        status: "new",
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("reader_article_submissions")
        .insert([payload]);

      if (error) throw new Error(error.message);

      setSubmitted(true);
      setForm(EMPTY_FORM);
      setCoverLocalUri(null);
      setCoverFileName("");
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String(err.message)
            : "Yuborib bo'lmadi. Qayta urinib ko'ring.";

      Alert.alert(
        "Xatolik",
        errorMessage
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCatName =
    categories.find((c) => c.id === form.category_id)?.name ?? null;

  if (submitted) {
    return (
      <View style={[styles.page, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.successPage, { paddingTop: insets.top }]}>
          <View style={styles.successIconWrap}>
            <CheckCircle size={64} color={Palette.red} />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>
            Maqolangiz tahririyatga yuborildi
          </Text>
          <Text style={[styles.successSub, { color: colors.textSecondary }]}>
            Jamoamiz maqolangizni ko'rib chiqadi va siz bilan bog'lanadi.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={styles.successBtn}
          >
            <Text style={styles.successBtnText}>Bosh sahifaga qaytish</Text>
          </Pressable>
          <Pressable
            onPress={() => setSubmitted(false)}
            style={[styles.successBtnAlt, { borderColor: colors.border }]}
          >
            <Text style={[styles.successBtnAltText, { color: colors.text }]}>Yana maqola yuborish</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Maqola yuborish</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Page intro */}
          <View style={styles.introBlock}>
            <Text style={styles.introKicker}>TAHRIRIYATGA YUBORISH</Text>
            <Text style={[styles.introTitle, { color: colors.text }]}>
              Maqolangizni yuboring
            </Text>
            <Text style={[styles.introDesc, { color: colors.textSecondary }]}>
              Milliy Tiklanish gazetasining o'quvchilari maqola taklif qilishlari mumkin. Maqola tahririyat ko'rib chiqqandan so'ng nashr etiladi.
            </Text>
          </View>

          {/* Warning */}
          <View style={styles.warningCard}>
            <AlertCircle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <Text style={styles.warningText}>
              {"Maqolalar faqat o'zbek lotin alifbosida, imloviy xatolarsiz yuborilishi kerak."}
            </Text>
          </View>

          {/* ── Section: Maqola haqida ──────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FileText size={16} color={Palette.red} />
              <Text style={styles.sectionTitle}>Maqola haqida</Text>
            </View>

            <Field label="Sarlavha" required error={errors.title}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: errors.title ? "#E53E3E" : colors.border, backgroundColor: colors.card }]}
                value={form.title}
                onChangeText={(v) => set("title", v)}
                placeholder="Maqola sarlavhasini kiriting..."
                placeholderTextColor={Palette.beige}
                maxLength={200}
              />
            </Field>

            <Field label="Bo'lim" required error={errors.category_id}>
              <Pressable
                onPress={() => setCatPickerOpen(true)}
                style={[
                  styles.pickerTrigger,
                  { borderColor: errors.category_id ? "#E53E3E" : colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text style={[styles.pickerValue, { color: selectedCatName ? colors.text : Palette.beige }]}>
                  {selectedCatName ?? "Bo'lim tanlang..."}
                </Text>
                <ChevronDown size={18} color={Palette.beige} />
              </Pressable>
            </Field>

            <Field label="Muqova rasm" error={errors.cover_url}>
              {coverLocalUri ? (
                <View style={styles.coverPreviewWrap}>
                  <Image source={{ uri: coverLocalUri }} style={styles.coverPreview} />
                  <Pressable
                    style={styles.coverRemoveBtn}
                    onPress={() => { setCoverLocalUri(null); setCoverFileName(""); }}
                  >
                    <X size={14} color={Palette.white} />
                  </Pressable>
                  <Pressable onPress={pickCover} style={styles.coverReplaceBtn}>
                    <Camera size={14} color={Palette.white} />
                    <Text style={styles.coverReplaceBtnText}>Almashtirish</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={pickCover}
                  style={[styles.coverPicker, { borderColor: errors.cover_url ? "#E53E3E" : colors.border, backgroundColor: colors.surface }]}
                >
                  <Camera size={28} color={Palette.beige} />
                  <Text style={[styles.coverPickerLabel, { color: colors.text }]}>Rasm yuklash</Text>
                  <Text style={[styles.coverPickerHint, { color: colors.textSecondary }]}>PNG, JPG, WebP · 16:9 tavsiya etiladi</Text>
                </Pressable>
              )}
            </Field>

            <Field label="Qisqa tavsif (anons)" required error={errors.anons}>
              <TextInput
                style={[styles.textarea, { color: colors.text, borderColor: errors.anons ? "#E53E3E" : colors.border, backgroundColor: colors.card }]}
                value={form.anons}
                onChangeText={(v) => set("anons", v)}
                placeholder="Maqolaning qisqa mazmunini kiriting..."
                placeholderTextColor={Palette.beige}
                multiline
                numberOfLines={3}
                maxLength={500}
                textAlignVertical="top"
              />
            </Field>

            <Field label="Maqola matni" required error={errors.body}>
              <TextInput
                style={[styles.textareaLarge, { color: colors.text, borderColor: errors.body ? "#E53E3E" : colors.border, backgroundColor: colors.card }]}
                value={form.body}
                onChangeText={(v) => set("body", v)}
                placeholder={"Maqola to'liq matnini kiriting...\n\nEsda tuting: faqat o'zbek lotin alifbosida, imloviy xatolarsiz."}
                placeholderTextColor={Palette.beige}
                multiline
                numberOfLines={12}
                textAlignVertical="top"
              />
            </Field>
          </View>

          {/* ── Section: Muallif ────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <User size={16} color={Palette.red} />
              <Text style={styles.sectionTitle}>Muallif ma'lumotlari</Text>
            </View>

            <Field label="To'liq ism" required error={errors.author_name}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: errors.author_name ? "#E53E3E" : colors.border, backgroundColor: colors.card }]}
                value={form.author_name}
                onChangeText={(v) => set("author_name", v)}
                placeholder="Familiya Ismi Sharifingiz..."
                placeholderTextColor={Palette.beige}
              />
            </Field>

            <Field label="Muallif haqida (ixtiyoriy)" error={errors.author_bio}>
              <TextInput
                style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                value={form.author_bio}
                onChangeText={(v) => set("author_bio", v)}
                placeholder="Mutaxassislik, tajriba, yutuqlar..."
                placeholderTextColor={Palette.beige}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </Field>
          </View>

          {/* ── Section: Aloqa ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Phone size={16} color={Palette.red} />
              <Text style={styles.sectionTitle}>Aloqa ma'lumotlari</Text>
            </View>

            <Field label="Telefon raqam" required error={errors.phone}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: errors.phone ? "#E53E3E" : colors.border, backgroundColor: colors.card }]}
                value={form.phone}
                onChangeText={(v) => set("phone", v)}
                placeholder="+998 90 123 45 67"
                placeholderTextColor={Palette.beige}
                keyboardType="phone-pad"
              />
            </Field>

            <Field label="Telegram raqam yoki username" required error={errors.telegram}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: errors.telegram ? "#E53E3E" : colors.border, backgroundColor: colors.card }]}
                value={form.telegram}
                onChangeText={(v) => set("telegram", v)}
                placeholder="@username yoki +998901234567"
                placeholderTextColor={Palette.beige}
                autoCapitalize="none"
              />
            </Field>
          </View>

          {/* Warning repeated before submit */}
          <View style={[styles.warningCard, { marginBottom: 4 }]}>
            <AlertCircle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <Text style={styles.warningText}>
              {"Maqolalar faqat o'zbek lotin alifbosida, imloviy xatolarsiz yuborilishi kerak."}
            </Text>
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          >
            {submitting ? (
              <ActivityIndicator color={Palette.white} size="small" />
            ) : (
              <Send size={18} color={Palette.white} />
            )}
            <Text style={styles.submitBtnText}>
              {submitting ? "Yuborilmoqda..." : "Tahririyatga yuborish"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <CategoryPicker
        visible={catPickerOpen}
        categories={categories}
        selected={form.category_id}
        onSelect={(id) => set("category_id", id)}
        onClose={() => setCatPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  topBarTitle: {
    fontSize: 16,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },

  // Scroll content
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
  },

  // Intro
  introBlock: { gap: 8 },
  introKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
    color: Palette.beige,
  },
  introTitle: {
    fontSize: 28,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    lineHeight: 36,
  },
  introDesc: {
    fontSize: 14,
    lineHeight: 22,
  },

  // Warning
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#F6E05E",
    borderRadius: 14,
    padding: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
    lineHeight: 20,
    fontWeight: "600",
  },

  // Sections
  section: {
    gap: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: 18,
    ...Platform.select({
      web: { boxShadow: "0 2px 12px rgba(0,0,0,0.05)" } as any,
    }),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Palette.black,
    letterSpacing: 0.2,
  },

  // Inputs
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    minHeight: 88,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  textareaLarge: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    minHeight: 220,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },

  // Category picker trigger
  pickerTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  pickerValue: { fontSize: 15 },

  // Cover image
  coverPicker: {
    height: 160,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  coverPickerLabel: { fontSize: 15, fontWeight: "700" },
  coverPickerHint: { fontSize: 12 },
  coverPreviewWrap: {
    borderRadius: 18,
    overflow: "hidden",
    height: 180,
    position: "relative",
  },
  coverPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  coverRemoveBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverReplaceBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.52)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  coverReplaceBtnText: { color: Palette.white, fontSize: 12, fontWeight: "700" },

  // Submit button
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Palette.red,
    borderRadius: 18,
    paddingVertical: 17,
    marginTop: 8,
    ...Platform.select({
      web: { boxShadow: "0 6px 24px rgba(237,28,36,0.30)" } as any,
    }),
  },
  submitBtnText: {
    color: Palette.white,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  // Success screen
  successPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  successIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(237,28,36,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 24,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 32,
  },
  successSub: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 300,
  },
  successBtn: {
    marginTop: 8,
    backgroundColor: Palette.red,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 18,
  },
  successBtnText: { color: Palette.white, fontSize: 15, fontWeight: "700" },
  successBtnAlt: {
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  successBtnAltText: { fontSize: 14, fontWeight: "600" },
});
