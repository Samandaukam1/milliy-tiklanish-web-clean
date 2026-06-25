import { router } from "expo-router";
import { Crown, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { signInWithGoogle } from "@/lib/googleAuth";
import { useApp } from "@/providers/AppProvider";
import { useColors } from "@/utils/useColors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ─── Floating Premium Banner (mobile: side FAB, web: sticky sidebar) ─────────

export function PremiumBanner({ visible }: { visible: boolean }) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  if (isDesktop) {
    // Web: sticky sidebar card
    return (
      <View style={webStyles.sidebar}>
        <Pressable style={webStyles.closeBtn} onPress={() => setDismissed(true)}>
          <X size={14} color={Palette.textSecondary} />
        </Pressable>
        <Crown size={28} color={Palette.red} />
        <Text style={webStyles.title}>{"Premiumga\nobuna bo'ling"}</Text>
        <Text style={webStyles.desc}>{"Barcha maqolalarga\ncheksiz kirish"}</Text>
        <Pressable style={webStyles.btn} onPress={() => router.push("/subscribe")}>
          <Text style={webStyles.btnText}>{"Obuna bo'lish"}</Text>
        </Pressable>
      </View>
    );
  }

  // Mobile: floating side button
  return (
    <Pressable
      style={mobileStyles.fab}
      onPress={() => router.push("/subscribe")}
      accessibilityLabel={"Premiumga obuna bo'ling"}
    >
      <Crown size={20} color={Palette.white} />
      <Text style={mobileStyles.fabText}>Premium</Text>
    </Pressable>
  );
}

// ─── Premium Lock Modal ───────────────────────────────────────────────────────

export function PremiumLockModal({
  visible,
  onClose,
  onSubscribe,
  onBuySingleArticle,
  buySingleLoading = false,
}: {
  visible: boolean;
  onClose: () => void;
  onSubscribe?: () => void;
  onBuySingleArticle?: () => void;
  buySingleLoading?: boolean;
}) {
  const colors = useColors();
  const { user } = useApp();
  const [googleLoading, setGoogleLoading] = useState(false);
  const isAuthenticated = Boolean(user && UUID_RE.test(user.id));

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      if (Platform.OS === "web") {
        await signInWithGoogle("/subscribe");
        // Page navigates away — no cleanup needed.
      } else {
        onClose();
        router.push("/subscribe");
      }
    } catch {
      setGoogleLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.backdrop}>
        <View style={[modalStyles.card, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          <Pressable style={modalStyles.closeBtn} onPress={onClose}>
            <X size={20} color={colors.textSecondary} />
          </Pressable>

          <ScrollView
            contentContainerStyle={modalStyles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={modalStyles.iconWrap}>
              <Crown size={36} color={Palette.white} />
            </View>

            <Text style={[modalStyles.title, { color: colors.text }]}>Premium Maqola</Text>

            {!isAuthenticated ? (
              <>
                <Text style={[modalStyles.desc, { color: colors.textSecondary }]}>
                  {"Bu maqola faqat premium obunachilarga mavjud. Davom etish uchun Google orqali tizimga kiring."}
                </Text>
                <Pressable
                  style={[modalStyles.btn, modalStyles.googleBtn]}
                  onPress={handleGoogleSignIn}
                  disabled={googleLoading}
                >
                  {googleLoading ? (
                    <ActivityIndicator color={Palette.white} />
                  ) : (
                    <>
                      <Text style={modalStyles.googleBtnG}>G</Text>
                      <Text style={modalStyles.primaryBtnText}>Google orqali kirish</Text>
                    </>
                  )}
                </Pressable>
                <Text style={[modalStyles.hint, { color: colors.textMuted }]}>
                  {"Kirganingizdan so'ng obuna bo'lishingiz mumkin"}
                </Text>
              </>
            ) : (
              <>
                <Text style={[modalStyles.desc, { color: colors.textSecondary }]}>
                  {"Bu maqola faqat premium obunachilarga mavjud. Premiumga obuna bo'ling yoki faqat shu maqolani sotib oling."}
                </Text>
                <View style={modalStyles.btnRow}>
                  <Pressable
                    style={[modalStyles.btn, modalStyles.primaryBtn]}
                    onPress={() => {
                      onClose();
                      if (onSubscribe) { onSubscribe(); return; }
                      router.push("/subscribe");
                    }}
                  >
                    <Crown size={16} color={Palette.white} />
                    <Text style={modalStyles.primaryBtnText}>{"Obuna bo'lish"}</Text>
                  </Pressable>

                  <Pressable
                    style={[modalStyles.btn, modalStyles.secondaryBtn]}
                    onPress={() => {
                      if (buySingleLoading) return;
                      if (onBuySingleArticle) { onBuySingleArticle(); return; }
                      onClose();
                      router.push("/subscribe");
                    }}
                    disabled={buySingleLoading}
                  >
                    {buySingleLoading ? (
                      <ActivityIndicator color={Palette.black} />
                    ) : (
                      <Text style={modalStyles.secondaryBtnText}>Sotib olish</Text>
                    )}
                  </Pressable>
                </View>
                <Text style={[modalStyles.hint, { color: colors.textMuted }]}>
                  {"29 000 so'm / oy · Istalgan vaqt bekor qiling"}
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const webStyles = StyleSheet.create({
  sidebar: {
    position: "absolute" as any,
    right: 0,
    top: 120,
    width: 180,
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 20,
    gap: 10,
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: "#ECE6D8",
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute" as any,
    top: 10,
    right: 10,
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    textAlign: "center",
    lineHeight: 22,
  },
  desc: {
    fontSize: 12,
    color: Palette.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  btn: {
    backgroundColor: Palette.red,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  btnText: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: "700",
  },
});

const mobileStyles = StyleSheet.create({
  fab: {
    position: "absolute" as any,
    right: 0,
    top: "40%",
    backgroundColor: Palette.red,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    alignItems: "center",
    gap: 6,
    shadowColor: Palette.red,
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
  fabText: {
    color: Palette.white,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    writingDirection: "ltr",
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  card: {
    backgroundColor: Palette.white,
    borderRadius: 24,
    width: "100%",
    maxWidth: 380,
    maxHeight: "100%" as any,
    overflow: "hidden",
  },
  scrollContent: {
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  closeBtn: {
    position: "absolute" as any,
    top: 16,
    right: 16,
    padding: 6,
    zIndex: 10,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "800",
    color: Palette.black,
    textAlign: "center",
  },
  desc: {
    fontSize: 14,
    color: Palette.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 4,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryBtn: {
    backgroundColor: Palette.red,
  },
  primaryBtnText: {
    color: Palette.white,
    fontSize: 14,
    fontWeight: "700",
  },
  googleBtn: {
    backgroundColor: "#4285F4",
    flex: 0,
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  googleBtnG: {
    color: Palette.white,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    fontFamily: Fonts.sans,
  },
  secondaryBtn: {
    backgroundColor: Palette.creamDeep,
    borderWidth: 1,
    borderColor: "#ECE6D8",
  },
  secondaryBtnText: {
    color: Palette.black,
    fontSize: 14,
    fontWeight: "700",
  },
  hint: {
    fontSize: 11,
    color: Palette.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
});
