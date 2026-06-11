import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { MessageCircle, Send, CornerDownRight, LogIn } from "lucide-react-native";
import { Palette } from "@/constants/colors";
import { Fonts } from "@/constants/fonts";
import { fetchComments, addComment } from "@/lib/services";
import { relativeUz } from "@/utils/date";
import { useColors } from "@/utils/useColors";
import type { AppComment } from "@/lib/types";

const PAGE_SIZE = 10;

interface Props {
  articleId: string;
  userId: string;
  authorName: string;
  commentsCount: number;
  isLoggedIn?: boolean;
}

export function CommentsSection({ articleId, userId, authorName, commentsCount: initialCount, isLoggedIn = false }: Props) {
  const colors = useColors();
  const [comments, setComments] = useState<AppComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(initialCount);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(
    async (pg = 0, append = false) => {
      if (pg === 0) setLoading(true);
      const result = await fetchComments(articleId, pg, PAGE_SIZE);
      setComments((prev) => (append ? [...prev, ...result] : result));
      setHasMore(result.length === PAGE_SIZE);
      if (pg === 0) setLoading(false);
    },
    [articleId]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !userId) return;
    Keyboard.dismiss();
    setSubmitting(true);
    const newComment = await addComment(
      userId,
      articleId,
      text.trim(),
      authorName,
      replyTo?.id ?? null
    );
    setSubmitting(false);
    if (!newComment) return;
    setText("");
    setReplyTo(null);
    if (newComment.parentId) {
      // Inject reply into parent's replies list
      setComments((prev) =>
        prev.map((c) =>
          c.id === newComment.parentId
            ? { ...c, replies: [...c.replies, newComment] }
            : c
        )
      );
    } else {
      setComments((prev) => [newComment, ...prev]);
      setTotal((t) => t + 1);
    }
  }, [text, userId, articleId, authorName, replyTo]);

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    load(nextPage, true);
  }, [page, load]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <MessageCircle size={18} color={Palette.red} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Izohlar {total > 0 ? `(${total})` : ""}
        </Text>
      </View>

      {/* Input or login prompt */}
      {isLoggedIn ? (
        <View
          style={[
            styles.inputCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {replyTo && (
            <View style={styles.replyBanner}>
              <CornerDownRight size={13} color={Palette.red} />
              <Text style={styles.replyBannerText} numberOfLines={1}>
                {replyTo.author}ga javob
              </Text>
              <Pressable onPress={() => setReplyTo(null)} style={styles.replyCancel}>
                <Text style={styles.replyCancelText}>✕</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.inputRow}>
            <View style={[styles.avatarSmall, { backgroundColor: Palette.red }]}>
              <Text style={styles.avatarSmallText}>
                {authorName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                { color: colors.text },
                Platform.select({ web: { outlineStyle: "none" } as any }),
              ]}
              placeholder="Izoh yozing..."
              placeholderTextColor={colors.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              returnKeyType="default"
            />
            <Pressable
              onPress={handleSend}
              disabled={!text.trim() || submitting}
              style={({ pressed }) => [
                styles.sendBtn,
                (!text.trim() || pressed) && styles.sendBtnDisabled,
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
      ) : (
        <Pressable
          style={[styles.loginPrompt, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push("/login" as any)}
        >
          <LogIn size={18} color={Palette.red} />
          <Text style={[styles.loginPromptText, { color: colors.text }]}>
            Izoh yozish uchun roʻxatdan oʻting
          </Text>
          <Text style={[styles.loginArrow, { color: Palette.red }]}>→</Text>
        </Pressable>
      )}

      {/* Comments list */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Palette.red} />
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MessageCircle size={28} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Hali izoh yo'q. Birinchi bo'lib yozing!
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={(id, name) => {
                setReplyTo({ id, author: name });
                setTimeout(() => inputRef.current?.focus(), 100);
              }}
            />
          ))}
          {hasMore && (
            <Pressable onPress={handleLoadMore} style={styles.loadMoreBtn}>
              <Text style={styles.loadMoreText}>Ko'proq ko'rish</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function CommentItem({
  comment,
  onReply,
  isReply = false,
}: {
  comment: AppComment;
  onReply: (id: string, name: string) => void;
  isReply?: boolean;
}) {
  const colors = useColors();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <View
        style={[
          styles.commentCard,
          isReply && styles.commentCardReply,
          {
            backgroundColor: isReply ? colors.surface : colors.card,
            borderColor: colors.border,
            ...Platform.select({
              web: { boxShadow: isReply ? "none" : "0 1px 6px rgba(0,0,0,0.06)" } as any,
            }),
          },
        ]}
      >
        {/* Author row */}
        <View style={styles.commentHeader}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: stringToColor(comment.authorName) },
            ]}
          >
            <Text style={styles.avatarText}>
              {comment.authorName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.commentMeta}>
            <Text style={[styles.commentAuthor, { color: colors.text }]}>
              {comment.authorName}
            </Text>
            <Text style={[styles.commentTime, { color: colors.textSecondary }]}>
              {relativeUz(comment.createdAt)}
            </Text>
          </View>
        </View>

        {/* Content */}
        <Text style={[styles.commentContent, { color: colors.text }]}>
          {comment.content}
        </Text>

        {/* Reply button */}
        {!isReply && (
          <Pressable
            onPress={() => onReply(comment.id, comment.authorName)}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={styles.replyBtn}
          >
            <CornerDownRight size={13} color={Palette.red} />
            <Text style={styles.replyBtnText}>Javob berish</Text>
          </Pressable>
        )}
      </View>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <View style={styles.repliesWrap}>
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} onReply={onReply} isReply />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

/** Deterministic color from name string for avatar background */
function stringToColor(str: string): string {
  const colors = ["#E53935", "#8E24AA", "#1E88E5", "#00897B", "#43A047", "#F4511E", "#6D4C41"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const styles = StyleSheet.create({
  root: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    color: Palette.black,
  },
  // ── Login prompt ──────────────────────────────────────────────────────────
  loginPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    ...Platform.select({
      web: { cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" } as any,
    }),
  },
  loginPromptText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  loginArrow: {
    fontSize: 18,
    fontWeight: "700",
  },
  // ── Input card ─────────────────────────────────────────────────────────────
  inputCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
    ...Platform.select({
      web: { boxShadow: "0 2px 10px rgba(0,0,0,0.06)" } as any,
    }),
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(237,28,36,0.06)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  replyBannerText: {
    flex: 1,
    fontSize: 12,
    color: Palette.red,
    fontWeight: "600",
  },
  replyCancel: { padding: 2 },
  replyCancelText: { fontSize: 11, color: Palette.textSecondary, fontWeight: "700" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarSmallText: { color: Palette.white, fontSize: 14, fontWeight: "700" },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 36,
    maxHeight: 120,
    paddingTop: 6,
    paddingBottom: 6,
    color: Palette.black,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.red,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...Platform.select({
      web: { cursor: "pointer", transitionProperty: "opacity", transitionDuration: "150ms" } as any,
    }),
  },
  sendBtnDisabled: { opacity: 0.45 },
  // ── Loading / empty ────────────────────────────────────────────────────────
  loadingWrap: { paddingVertical: 32, alignItems: "center" },
  emptyWrap: { paddingVertical: 32, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 13, textAlign: "center" },
  // ── Comment list ───────────────────────────────────────────────────────────
  list: { gap: 12 },
  commentCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  commentCardReply: {
    borderRadius: 12,
    borderWidth: 1,
  },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { color: Palette.white, fontSize: 14, fontWeight: "700" },
  commentMeta: { flex: 1 },
  commentAuthor: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  commentTime: { fontSize: 11, marginTop: 1 },
  commentContent: { fontSize: 14, lineHeight: 22 },
  replyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 4,
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },
  replyBtnText: { fontSize: 12, color: Palette.red, fontWeight: "600" },
  repliesWrap: { paddingLeft: 16, gap: 8, marginTop: 4 },
  loadMoreBtn: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Palette.border,
    marginTop: 4,
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },
  loadMoreText: { fontSize: 13, color: Palette.textSecondary, fontWeight: "600" },
});
