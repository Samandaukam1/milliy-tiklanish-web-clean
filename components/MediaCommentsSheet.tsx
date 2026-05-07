import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { MessageCircle, Send, X } from "lucide-react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { addMediaVideoComment, fetchMediaVideoComments } from "@/lib/services";
import type { AppMediaComment } from "@/lib/types";
import { relativeUz } from "@/utils/date";

type Props = {
  visible: boolean;
  videoId: string;
  userId: string;
  authorName: string;
  initialCount: number;
  onClose: () => void;
  onCommentAdded?: () => void;
};

export function MediaCommentsSheet({
  visible,
  videoId,
  userId,
  authorName,
  initialCount,
  onClose,
  onCommentAdded,
}: Props) {
  const [comments, setComments] = useState<AppMediaComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    if (!visible || !videoId) {
      return;
    }

    setLoading(true);
    const data = await fetchMediaVideoComments(videoId);
    setComments(data);
    setLoading(false);
  }, [videoId, visible]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(() => Math.max(initialCount, comments.length), [comments.length, initialCount]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !userId || submitting) {
      return;
    }

    setSubmitting(true);
    const newComment = await addMediaVideoComment(videoId, userId, authorName, trimmed);
    setSubmitting(false);

    if (!newComment) {
      return;
    }

    setText("");
    setComments((prev) => [newComment, ...prev]);
    onCommentAdded?.();
  }, [authorName, onCommentAdded, submitting, text, userId, videoId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalRoot}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <MessageCircle size={18} color={Palette.red} />
              <Text style={styles.headerTitle}>Izohlar ({total})</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={18} color={Palette.black} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Palette.red} />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{"Hali izoh yo'q. Birinchi bo'lib yozing."}</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {comments.map((comment) => (
                <View key={comment.id} style={styles.commentCard}>
                  <View style={styles.commentTopRow}>
                    <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                    <Text style={styles.commentTime}>{relativeUz(comment.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentText}>{comment.content}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.inputCard}>
            <TextInput
              style={[
                styles.input,
                Platform.select({ web: { outlineStyle: "none" } as any }),
              ]}
              value={text}
              onChangeText={setText}
              placeholder="Izoh yozing..."
              placeholderTextColor={Palette.textMuted}
              multiline
              maxLength={700}
            />
            <Pressable
              onPress={handleSend}
              disabled={!text.trim() || submitting}
              style={({ pressed }) => [
                styles.sendButton,
                (!text.trim() || pressed || submitting) && styles.sendButtonDisabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Palette.white} />
              ) : (
                <Send size={16} color={Palette.white} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17,17,17,0.42)",
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: Palette.cream,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderColor: Palette.border,
  },
  handle: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: Palette.beigeLight,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    color: Palette.black,
    fontFamily: Fonts.serif,
    fontSize: 20,
    fontWeight: "800",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  centered: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: 12,
    paddingBottom: 16,
  },
  commentCard: {
    backgroundColor: Palette.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  commentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  commentAuthor: {
    color: Palette.black,
    fontSize: 14,
    fontWeight: "700",
  },
  commentTime: {
    color: Palette.textSecondary,
    fontSize: 12,
  },
  commentText: {
    color: Palette.black,
    fontSize: 14,
    lineHeight: 20,
  },
  inputCard: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    backgroundColor: Palette.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    color: Palette.black,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.red,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
});