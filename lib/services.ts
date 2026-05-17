import { Image } from "expo-image";
import { supabase } from "./supabase";
import type {
  DbArticle,
  DbCategory,
  DbArticleBlock,
  DbIssue,
  DbMediaVideo,
  AppArticle,
  AppAudioItem,
  AppAuthor,
  AppBlock,
  AppCategory,
  AppIssue,
  AppMediaComment,
  AppMediaItem,
  AppComment,
  SocialSettings,
} from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Language = "uz" | "uz_cy" | "ru" | "en";

type MediaFeedResult = {
  shorts: AppMediaItem[];
  longs: AppMediaItem[];
  all: AppMediaItem[];
  error?: string;
};

type MediaVideoForeignColumn = "video_id" | "media_video_id";

const MEDIA_FEED_TTL_MS = 5 * 60 * 1000;
const MEDIA_VIDEO_FOREIGN_COLUMNS: MediaVideoForeignColumn[] = ["video_id", "media_video_id"];
const warmedThumbnailUrls = new Set<string>();
const warmedMediaMetadataUrls = new Set<string>();
const viewedMediaVideoIds = new Set<string>();
const mediaVideoColumnCache = new Map<string, MediaVideoForeignColumn>();
const cachedMediaFeeds = new Map<Language, { data: MediaFeedResult; fetchedAt: number }>();
const inFlightMediaFeeds = new Map<Language, Promise<MediaFeedResult>>();
const MEDIA_VIDEO_SELECT_WITH_ARTICLE = `
  *,
  articles:article_id (
    id,
    title_uz,
    summary_uz,
    featured_image_url
  )
`;

function isMissingSupabaseColumn(error: { message?: string | null } | null | undefined, column: string): boolean {
  const message = error?.message ?? "";
  return message.includes(column) && /column .* does not exist|schema cache|could not find/i.test(message);
}

function isDuplicateRowError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505";
}

function normalizeMediaVideoCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeMediaArticleId(value: string | number | null | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue || null;
  }

  return null;
}

async function warmThumbnail(url: string | null | undefined): Promise<void> {
  const trimmedUrl = typeof url === "string" ? url.trim() : "";
  if (!trimmedUrl || warmedThumbnailUrls.has(trimmedUrl)) {
    return;
  }

  warmedThumbnailUrls.add(trimmedUrl);
  try {
    await Image.prefetch(trimmedUrl);
  } catch {
    warmedThumbnailUrls.delete(trimmedUrl);
  }
}

async function warmMediaMetadata(url: string | null | undefined): Promise<void> {
  const trimmedUrl = typeof url === "string" ? url.trim() : "";
  if (!trimmedUrl || warmedMediaMetadataUrls.has(trimmedUrl)) {
    return;
  }

  warmedMediaMetadataUrls.add(trimmedUrl);
  try {
    await fetch(trimmedUrl, { method: "HEAD" });
  } catch {
    warmedMediaMetadataUrls.delete(trimmedUrl);
  }
}

function normalizeEmbeddedMediaArticle(row: DbMediaVideo): NonNullable<AppMediaItem["articles"]> | null {
  const embedded = row.articles;
  if (!embedded) {
    return null;
  }

  return {
    id: normalizeMediaArticleId(embedded.id),
    title_uz: embedded.title_uz?.trim() || null,
    summary_uz: embedded.summary_uz?.trim() || null,
    featured_image_url: embedded.featured_image_url?.trim() || null,
  };
}

function normalizeMediaRow(row: DbMediaVideo, linkedArticles: Map<string, AppArticle>): AppMediaItem | null {
  const youtubeId = extractYouTubeId(row.youtube_url);
  const uploadedUrl = row.video_url?.trim() || null;
  const type = row.type === "long" ? "long" : "short";

  if (type === "short" && !uploadedUrl) {
    return null;
  }

  if (type === "long" && !uploadedUrl && !youtubeId) {
    return null;
  }

  const embeddedArticle = normalizeEmbeddedMediaArticle(row);
  const articleId = normalizeMediaArticleId(row.article_id) || normalizeMediaArticleId(row.linked_article_id) || embeddedArticle?.id || null;
  const thumbnailUrl = row.thumbnail_url?.trim() || null;
  const fetchedArticle = articleId ? linkedArticles.get(articleId) ?? null : null;
  const embeddedLinkedArticle = embeddedArticle
    ? {
        id: embeddedArticle.id || articleId || "",
        title: embeddedArticle.title_uz || fetchedArticle?.title || "Maqolani o'qish",
        excerpt: embeddedArticle.summary_uz || fetchedArticle?.excerpt || "",
        cover:
          embeddedArticle.featured_image_url ||
          fetchedArticle?.cover ||
          thumbnailUrl ||
          getYouTubeThumbnail(row.youtube_url),
        categoryId: fetchedArticle?.categoryId || "",
        categoryName: fetchedArticle?.categoryName || "",
        authorName: fetchedArticle?.authorName || "",
        publishedAt: fetchedArticle?.publishedAt || new Date().toISOString(),
        readMinutes: fetchedArticle?.readMinutes || 0,
        tier: fetchedArticle?.tier || "free",
        title_uz: embeddedArticle.title_uz,
        summary_uz: embeddedArticle.summary_uz,
      }
    : null;

  return {
    id: row.id,
    title: row.title?.trim() || "",
    description: row.description?.trim() || "",
    type,
    source: uploadedUrl ? "upload" : "youtube",
    video_url: uploadedUrl,
    youtube_url: youtubeId ? row.youtube_url?.trim() || null : null,
    linked_article_id: normalizeMediaArticleId(row.linked_article_id) || articleId,
    article_id: articleId,
    cover: thumbnailUrl || getYouTubeThumbnail(row.youtube_url),
    thumbnail_url: thumbnailUrl,
    views_count: normalizeMediaVideoCount(row.views_count),
    likes_count: normalizeMediaVideoCount(row.likes_count),
    comments_count: normalizeMediaVideoCount(row.comments_count),
    shares_count: normalizeMediaVideoCount(row.shares_count),
    articles: embeddedArticle,
    linkedArticle: fetchedArticle ?? embeddedLinkedArticle,
  };
}

async function warmMediaItems(items: AppMediaItem[]): Promise<void> {
  const initialItems = items.slice(0, 6);
  await Promise.allSettled(initialItems.map((item) => warmThumbnail(item.thumbnail_url || item.cover)));
  await Promise.allSettled(initialItems.slice(0, 3).map((item) => warmMediaMetadata(item.video_url)));
}

async function runWithMediaVideoColumn<T>(
  table: string,
  action: (column: MediaVideoForeignColumn) => Promise<{ data: T | null; error: { message?: string | null; code?: string | null } | null }>
): Promise<{ data: T | null; error: { message?: string | null; code?: string | null } | null; column: MediaVideoForeignColumn }> {
  const preferred = mediaVideoColumnCache.get(table);
  const columns = preferred
    ? [preferred, ...MEDIA_VIDEO_FOREIGN_COLUMNS.filter((column) => column !== preferred)]
    : MEDIA_VIDEO_FOREIGN_COLUMNS;

  let lastResult: { data: T | null; error: { message?: string | null; code?: string | null } | null; column: MediaVideoForeignColumn } | null = null;

  for (const column of columns) {
    const result = await action(column);
    const withColumn = { ...result, column };

    if (!result.error) {
      mediaVideoColumnCache.set(table, column);
      return withColumn;
    }

    lastResult = withColumn;
    if (!isMissingSupabaseColumn(result.error, column)) {
      return withColumn;
    }
  }

  return lastResult ?? { data: null, error: null, column: MEDIA_VIDEO_FOREIGN_COLUMNS[0] };
}

async function adjustMediaVideoCounter(
  videoId: string,
  field: "views_count" | "likes_count" | "comments_count" | "shares_count",
  delta: number
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("media_videos")
      .select(field)
      .eq("id", videoId)
      .single();

    if (error) {
      return null;
    }

    const current = normalizeMediaVideoCount((data as Record<string, number | null | undefined> | null)?.[field]);
    const nextValue = Math.max(0, current + delta);

    const { error: updateError } = await supabase
      .from("media_videos")
      .update({ [field]: nextValue })
      .eq("id", videoId);

    return updateError ? null : nextValue;
  } catch {
    return null;
  }
}

async function fetchMediaFeed(lang: Language): Promise<MediaFeedResult> {
  let queryResult = await supabase
    .from("media_videos")
    .select(MEDIA_VIDEO_SELECT_WITH_ARTICLE)
    .order("created_at", { ascending: false });

  if (queryResult.error) {
    console.warn("[fetchMediaItems] article embed failed, falling back to base media_videos query:", queryResult.error.message);
    queryResult = await supabase
      .from("media_videos")
      .select("*")
      .order("created_at", { ascending: false });
  }

  const { data, error } = queryResult;

  if (error) {
    console.error("[fetchMediaItems] Supabase error:", JSON.stringify(error));
    return { shorts: [], longs: [], all: [], error: error.message };
  }

  const rows = (data as DbMediaVideo[] | null) ?? [];
  if (rows.length === 0) {
    return { shorts: [], longs: [], all: [] };
  }

  const articleIds = [
    ...new Set(
      rows
        .map((row) => normalizeMediaArticleId(row.article_id) || normalizeMediaArticleId(row.linked_article_id) || normalizeMediaArticleId(row.articles?.id) || null)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const linkedArticles = articleIds.length > 0 ? await fetchArticlesByIds(articleIds, lang) : [];
  const linkedArticleMap = new Map(linkedArticles.map((article) => [article.id, article]));
  const items = rows
    .map((row) => normalizeMediaRow(row, linkedArticleMap))
    .filter((item): item is AppMediaItem => Boolean(item));

  const shorts = items.filter((item) => item.type === "short");
  const longs = items.filter((item) => item.type === "long");
  const all = [...shorts, ...longs];

  void warmMediaItems(shorts.length > 0 ? shorts : all);

  return { shorts, longs, all };
}

export async function preloadMediaItems(lang: Language): Promise<void> {
  await fetchMediaItems(lang);
}

export async function preloadMediaNeighbors(items: AppMediaItem[], activeIndex: number): Promise<void> {
  const slice = items.slice(activeIndex, activeIndex + 3);
  await Promise.allSettled(slice.map((item) => warmMediaMetadata(item.video_url)));
  await Promise.allSettled(slice.map((item) => warmThumbnail(item.thumbnail_url || item.cover)));
}

export async function fetchUserLikedMediaVideoIds(videoIds: string[], userId: string): Promise<Set<string>> {
  if (!userId || videoIds.length === 0) {
    return new Set();
  }

  try {
    const result = await runWithMediaVideoColumn<any[]>("media_video_likes", (column) =>
      supabase
        .from("media_video_likes")
        .select(column)
        .eq("user_id", userId)
        .in(column, videoIds)
    );

    if (result.error || !result.data) {
      return new Set();
    }

    return new Set((result.data as Record<string, string>[]).map((row) => String(row[result.column])).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function setMediaVideoLike(videoId: string, userId: string, shouldLike: boolean): Promise<{ liked: boolean; likesCount: number | null }> {
  if (!videoId || !userId) {
    return { liked: false, likesCount: null };
  }

  try {
    const result = await runWithMediaVideoColumn<unknown>("media_video_likes", (column) =>
      shouldLike
        ? supabase.from("media_video_likes").insert({ user_id: userId, [column]: videoId })
        : supabase.from("media_video_likes").delete().eq("user_id", userId).eq(column, videoId)
    );

    if (result.error && !(shouldLike && isDuplicateRowError(result.error))) {
      return { liked: !shouldLike, likesCount: null };
    }

    const likesCount = await adjustMediaVideoCounter(videoId, "likes_count", shouldLike ? 1 : -1);
    return { liked: shouldLike, likesCount };
  } catch {
    return { liked: !shouldLike, likesCount: null };
  }
}

export async function recordMediaVideoShare(videoId: string, userId: string): Promise<number | null> {
  if (!videoId || !userId) {
    return null;
  }

  try {
    const result = await runWithMediaVideoColumn<unknown>("media_video_shares", (column) =>
      supabase.from("media_video_shares").insert({ user_id: userId, [column]: videoId })
    );

    if (result.error) {
      return null;
    }

    return adjustMediaVideoCounter(videoId, "shares_count", 1);
  } catch {
    return null;
  }
}

export async function recordMediaVideoView(videoId: string): Promise<number | null> {
  if (!videoId || viewedMediaVideoIds.has(videoId)) {
    return null;
  }

  viewedMediaVideoIds.add(videoId);
  const nextValue = await adjustMediaVideoCounter(videoId, "views_count", 1);
  if (nextValue === null) {
    viewedMediaVideoIds.delete(videoId);
  }

  return nextValue;
}

export async function fetchMediaVideoComments(videoId: string): Promise<AppMediaComment[]> {
  if (!videoId) {
    return [];
  }

  try {
    const result = await runWithMediaVideoColumn<any[]>("media_video_comments", (column) =>
      supabase
        .from("media_video_comments")
        .select("id, user_id, author_name, content, created_at, video_id, media_video_id")
        .eq(column, videoId)
        .order("created_at", { ascending: false })
    );

    if (result.error || !result.data) {
      return [];
    }

    return (result.data as Record<string, string>[]).map((row) => ({
      id: String(row.id),
      videoId: String(row[result.column] ?? videoId),
      userId: String(row.user_id ?? ""),
      authorName: String(row.author_name ?? "Foydalanuvchi"),
      content: String(row.content ?? ""),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

export async function addMediaVideoComment(
  videoId: string,
  userId: string,
  authorName: string,
  content: string
): Promise<AppMediaComment | null> {
  if (!videoId || !userId || !content.trim()) {
    return null;
  }

  try {
    const result = await runWithMediaVideoColumn<Record<string, string>>("media_video_comments", (column) =>
      supabase
        .from("media_video_comments")
        .insert({ user_id: userId, author_name: authorName, content: content.trim(), [column]: videoId })
        .select("id, user_id, author_name, content, created_at, video_id, media_video_id")
        .single()
    );

    if (result.error || !result.data) {
      return null;
    }

    void adjustMediaVideoCounter(videoId, "comments_count", 1);

    return {
      id: String(result.data.id),
      videoId: String(result.data[result.column] ?? videoId),
      userId: String(result.data.user_id ?? userId),
      authorName: String(result.data.author_name ?? authorName),
      content: String(result.data.content ?? content.trim()),
      createdAt: String(result.data.created_at ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

/** Get localized string from a DB row given field base name */
export function localizeField(
  row: Record<string, any>,
  field: string,
  lang: Language
): string {
  const key = `${field}_${lang}`;
  const fallback = `${field}_uz`;
  const val = row[key] || row[fallback] || "";
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  // DB may return objects/arrays (e.g. JSON columns) — stringify so string methods work
  if (typeof val === "object") {
    const s = (val as any).text || (val as any).content || (val as any).value || "";
    return typeof s === "string" ? s : JSON.stringify(val);
  }
  return String(val);
}

/** Extract YouTube video ID from any YouTube URL format */
export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // Handle already-bare IDs (exactly 11 URL-safe chars, no slash/dot/?)
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,               // ?v=ID or &v=ID
    /youtu\.be\/([A-Za-z0-9_-]{11})/,           // youtu.be/ID
    /\/shorts\/([A-Za-z0-9_-]{11})/,            // /shorts/ID  (Shorts URLs)
    /\/embed\/([A-Za-z0-9_-]{11})/,             // /embed/ID
    /\/v\/([A-Za-z0-9_-]{11})/,                 // /v/ID
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];  // Each group captures exactly 11 chars — query params excluded
  }
  if (__DEV__) {
    console.warn("[extractYouTubeId] Could not extract ID from URL:", trimmed);
  }
  return null;
}

/** Get YouTube thumbnail from URL */
export function getYouTubeThumbnail(url: string | null | undefined): string {
  const id = extractYouTubeId(url);
  if (!id) return "https://images.unsplash.com/photo-1524230572899-a752b3835840?w=800";
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeArticle(
  row: DbArticle,
  lang: Language,
  categories: DbCategory[]
): AppArticle {
  const cat = categories.find((c) => c.id === row.category_id);
  const catName = cat
    ? localizeField(cat as any, "name", lang) || "Umumiy"
    : (row.category_hint || "Yangiliklar");

  return {
    id: String(row.id),
    title: localizeField(row as any, "title", lang) || "—",
    excerpt: localizeField(row as any, "summary", lang),
    cover: row.featured_image_url || "https://images.unsplash.com/photo-1524230572899-a752b3835840?w=800",
    categoryId: row.category_id || "",
    categoryName: catName,
    authorName: row.author_name || "Tahririyat",
    publishedAt: row.published_at || row.created_at || new Date().toISOString(),
    readMinutes: row.read_time_minutes || 3,
    tier: row.is_premium ? "premium" : "free",
    is_featured: row.is_featured ?? false,
    viewCount: row.view_count ?? 0,
    likesCount: row.likes_count ?? 0,
    commentsCount: row.comments_count ?? 0,
    audio_url: row.audio_url,
    slug: row.slug,
    issue_id: row.issue_id ?? null,
    title_uz: row.title_uz,
    title_uz_cy: row.title_uz_cy,
    title_ru: row.title_ru,
    title_en: row.title_en,
    summary_uz: row.summary_uz,
    summary_uz_cy: row.summary_uz_cy,
    summary_ru: row.summary_ru,
    summary_en: row.summary_en,
    content_uz: row.content_uz,
    content_uz_cy: row.content_uz_cy,
    content_ru: row.content_ru,
    content_en: row.content_en,
    author_image_url: row.author_image_url,
    author_bio_uz: row.author_bio_uz,
    author_bio_uz_cy: row.author_bio_uz_cy,
    author_bio_ru: row.author_bio_ru,
    author_bio_en: row.author_bio_en,
  };
}

function normalizeCategory(row: DbCategory, lang: Language): AppCategory {
  return {
    id: String(row.id),
    name: localizeField(row as any, "name", lang) || "Umumiy",
    slug: row.slug,
  };
}

/**
 * Some admin panels store the entire block payload as a JSON string in a single
 * `text` (or `content`) column instead of using proper localized columns.
 * e.g. text = '{"type":"paragraph","text_uz":"Amir Temur...","media_url":"..."}'
 * This helper parses that blob and returns the object, or null if not JSON.
 */
function tryParseJsonBlob(val: any): Record<string, any> | null {
  if (!val) return null;
  if (typeof val === "object") return val as Record<string, any>;
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Pick the best localized string from a parsed blob, trying lang-specific keys first */
function pickLocalized(obj: Record<string, any>, field: string, lang: Language): string {
  const keys = [`${field}_${lang}`, `${field}_uz`, field];
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === "string") return v;
    if (v && typeof v === "object") {
      // nested blob — try to get a string from it
      const inner = (v as any).text || (v as any).content || "";
      if (inner && typeof inner === "string") return inner;
    }
  }
  return "";
}

function normalizeBlock(row: DbArticleBlock, lang: Language): AppBlock {
  // Some admin panels use 'block_type' column instead of 'type'
  const rowAny = row as any;

  // Try to parse a JSON blob from the raw text/content column first
  const jsonBlob: Record<string, any> | null =
    tryParseJsonBlob(rowAny.text) ||
    tryParseJsonBlob(rowAny.content) ||
    tryParseJsonBlob(rowAny.body) ||
    null;

  // Block type — prefer the DB column; fall back to what's inside the JSON blob
  const blockType: string =
    row.type ??
    rowAny.block_type ??
    (jsonBlob ? (jsonBlob.type ?? "paragraph") : "paragraph");

  // Text — try proper localized columns first, then parse from JSON blob
  const text: string | undefined = (() => {
    // 1. Proper localized columns (text_uz, text_ru, …)
    const fromCols =
      localizeField(row as any, "text", lang) ||
      localizeField(row as any, "content", lang) ||
      localizeField(row as any, "body", lang);
    if (fromCols) return fromCols;

    // 2. JSON blob
    if (jsonBlob) {
      const fromBlob = pickLocalized(jsonBlob, "text", lang) ||
        pickLocalized(jsonBlob, "content", lang) ||
        pickLocalized(jsonBlob, "body", lang);
      if (fromBlob) return fromBlob;
    }

    // 3. Raw non-JSON string in `text` column
    if (typeof rowAny.text === "string" && !rowAny.text.trim().startsWith("{")) {
      return rowAny.text || undefined;
    }

    return undefined;
  })();

  // Quote text
  const quote: string | undefined = (() => {
    const fromCols = localizeField(row as any, "quote", lang);
    if (fromCols) return fromCols;
    if (jsonBlob) {
      const fromBlob = pickLocalized(jsonBlob, "quote", lang);
      if (fromBlob) return fromBlob;
    }
    return undefined;
  })();

  // Media URL — check blob too
  const media_url: string | null =
    row.media_url ||
    (jsonBlob ? (jsonBlob.media_url || jsonBlob.url || jsonBlob.image_url || null) : null);

  // YouTube URL — check blob too
  const youtube_url: string | null =
    row.youtube_url ||
    (jsonBlob ? (jsonBlob.youtube_url || jsonBlob.video_url || null) : null);

  // Caption
  const caption: string | undefined = (() => {
    const fromCols = localizeField(row as any, "caption", lang);
    if (fromCols) return fromCols;
    if (jsonBlob) return pickLocalized(jsonBlob, "caption", lang) || undefined;
    return undefined;
  })();

  // Attribution
  const attribution: string | null =
    row.attribution || (jsonBlob ? (jsonBlob.attribution || null) : null);

  if (__DEV__) {
    console.log(
      "[normalizeBlock] id:", row.id,
      "| type:", blockType,
      "| text:", text ? text.slice(0, 40) : "none",
      "| hasBlob:", !!jsonBlob
    );
  }

  return {
    id: row.id,
    type: blockType,
    sort_order: row.sort_order ?? 0,
    text,
    quote,
    attribution,
    level: row.level,
    media_url,
    youtube_url,
    caption,
  };
}

// ─── Shared category cache ────────────────────────────────────────────────────

let cachedCategories: DbCategory[] | null = null;

async function fetchRawCategories(): Promise<DbCategory[]> {
  if (cachedCategories) return cachedCategories;
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (__DEV__) console.log("[fetchRawCategories] FETCH RESULT:", data?.length, "| ERROR:", error?.message);
    if (error || !data) return [];
    cachedCategories = data as DbCategory[];
    return cachedCategories;
  } catch (e) {
    if (__DEV__) console.error("[fetchRawCategories] FETCH ERROR:", e);
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchCategories(lang: Language): Promise<AppCategory[]> {
  const raw = await fetchRawCategories();
  return raw.map((c) => normalizeCategory(c, lang));
}

export async function fetchHomeData(lang: Language): Promise<{
  featured: AppArticle | null;
  trending: AppArticle[];
  latest: AppArticle[];
}> {
  let cats: DbCategory[] = [];
  try {
    cats = await fetchRawCategories();
  } catch {}

  // ── Primary: simple unfiltered query, always succeeds if anon can read table ──
  let rows: DbArticle[] = [];
  try {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    console.log("[HOME] FETCH RESULT:", data?.length ?? 0, "| ERROR:", error?.message ?? "none");

    if (data && data.length > 0) {
      rows = data as DbArticle[];
    } else if (error) {
      console.error("[HOME] FETCH ERROR:", error.message);
    }
  } catch (e) {
    console.error("[HOME] FETCH ERROR (exception):", e);
  }

  const normalized = rows.map((r) => normalizeArticle(r, lang, cats));

  // Hero: newest article
  const featured = normalized[0] ?? null;
  console.log("[HOME] latest article:", featured?.id ?? "none", "|", featured?.title?.slice(0, 40) ?? "—");

  // Trending: sort fetched rows by view_count descending (client-side, no extra query)
  // Falls back gracefully when view_count is null/missing
  const sortedByViews = [...rows].sort((a, b) => {
    const va = (a as any).view_count ?? 0;
    const vb = (b as any).view_count ?? 0;
    return vb - va;
  });
  const trending = sortedByViews.map((r) => normalizeArticle(r, lang, cats)).slice(0, 10);
  console.log("[HOME] most read articles count:", trending.length);

  return { featured, trending, latest: normalized };
}

export async function fetchArticles(
  lang: Language,
  categoryId?: string
): Promise<AppArticle[]> {
  const [cats, res] = await Promise.all([
    fetchRawCategories(),
    (() => {
      let q = supabase
        .from("articles")
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(60);
      if (categoryId) q = q.eq("category_id", categoryId);
      return q;
    })(),
  ]);

  if (res.error || !res.data) return [];
  return (res.data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
}

export async function fetchArticleById(
  id: string | number,
  lang: Language
): Promise<AppArticle | null> {
  const queryId = typeof id === "string" && /^\d+$/.test(id.trim()) ? Number(id.trim()) : id;
  const [cats, res] = await Promise.all([
    fetchRawCategories(),
    supabase.from("articles").select("*").eq("id", queryId).maybeSingle(),
  ]);

  if (res.error || !res.data) return null;
  return normalizeArticle(res.data as DbArticle, lang, cats);
}

export async function incrementViewCount(articleId: string): Promise<void> {
  try {
    // Try RPC first; if not available fall back to a direct increment update
    const { error: rpcError } = await supabase.rpc("increment_view_count", {
      article_id: articleId,
    });
    if (rpcError) {
      // Fallback: fetch current count then update
      const { data } = await supabase
        .from("articles")
        .select("view_count")
        .eq("id", articleId)
        .single();
      const current = (data as any)?.view_count ?? 0;
      await supabase
        .from("articles")
        .update({ view_count: current + 1 })
        .eq("id", articleId);
    }
  } catch (e) {
    if (__DEV__) console.warn("[incrementViewCount] failed silently:", e);
  }
}

export async function fetchArticleBlocks(
  articleId: string,
  lang: Language
): Promise<AppBlock[]> {
  const { data, error } = await supabase
    .from("article_blocks")
    .select("*")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(
      "[fetchArticleBlocks] Supabase error for article",
      articleId,
      ":",
      error.message
    );
    return [];
  }
  if (!data || data.length === 0) {
    if (__DEV__)
      console.log("[fetchArticleBlocks] 0 blocks for article", articleId);
    return [];
  }

  if (__DEV__) {
    console.log(
      "[fetchArticleBlocks] article",
      articleId,
      "→",
      data.length,
      "blocks:",
      data.map((b: any) => `${b.type}(order=${b.sort_order})`)
    );
    if (data.length > 0) {
      console.log(
        "[fetchArticleBlocks] RAW first block keys:",
        Object.keys(data[0] as object).join(", ")
      );
      console.log(
        "[fetchArticleBlocks] RAW first block:",
        JSON.stringify(data[0], null, 2)
      );
    }
  }

  return (data as DbArticleBlock[]).map((b) => normalizeBlock(b, lang));
}

export async function fetchRelatedArticles(
  articleId: string,
  categoryId: string,
  lang: Language
): Promise<AppArticle[]> {
  const [cats, res] = await Promise.all([
    fetchRawCategories(),
    supabase
      .from("articles")
      .select("*")
      .eq("is_published", true)
      .eq("category_id", categoryId)
      .neq("id", articleId)
      .order("published_at", { ascending: false })
      .limit(6),
  ]);

  if (res.error || !res.data) return [];
  return (res.data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
}

export async function fetchIssueArticles(
  issueId: string,
  excludeId: string,
  lang: Language
): Promise<AppArticle[]> {
  const [cats, res] = await Promise.all([
    fetchRawCategories(),
    supabase
      .from("articles")
      .select("*")
      .eq("is_published", true)
      .eq("issue_id", issueId)
      .neq("id", excludeId)
      .order("published_at", { ascending: false })
      .limit(8),
  ]);

  if (res.error || !res.data) return [];
  return (res.data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
}

export async function fetchTopAuthors(lang: Language): Promise<AppAuthor[]> {
  const res = await supabase
    .from("articles")
    .select("author_name,author_image_url,author_bio_uz,author_bio_uz_cy,author_bio_ru,author_bio_en")
    .eq("is_published", true)
    .not("author_name", "is", null);

  if (res.error || !res.data) return [];

  const counts: Record<string, { count: number; imageUrl: string | null; bio: string | null }> = {};
  for (const row of res.data as any[]) {
    const name = row.author_name as string;
    if (!name) continue;
    const bio = localizeField(row as any, "author_bio", lang) || null;
    if (!counts[name]) {
      counts[name] = { count: 1, imageUrl: row.author_image_url ?? null, bio };
    } else {
      counts[name].count += 1;
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, data]) => ({
      name,
      imageUrl: data.imageUrl,
      articleCount: data.count,
      bio: data.bio,
    }));
}

export async function fetchIssues(lang: Language): Promise<AppIssue[]> {
  const mapIssue = (row: DbIssue): AppIssue => {
    const localizedTitle =
      localizeField(row as any, "title", lang) ||
      (row as any).title ||
      `Gazeta Soni #${row.number ?? ""}`;
    const coverPrimary =
      lang === "uz_cy"
        ? row.cover_image_cy_url || row.cover_image_url
        : row.cover_image_url || row.cover_image_cy_url;

    return {
      id: row.id,
      number: row.number ?? 0,
      title: localizedTitle,
      cover:
        coverPrimary ||
        row.cover_url ||
        "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800",
      pdfUrl: row.pdf_url ?? null,
      publishedAt: row.publish_date || row.published_at || new Date().toISOString(),
    };
  };

  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("is_published", true)
    .limit(20);

  if (error || !data) {
    if (__DEV__) {
      console.log("[fetchIssues] Supabase error:", error?.message || "unknown");
    }
    return [];
  }

  const mapped = (data as DbIssue[]).map(mapIssue);
  const sorted = mapped.sort((a, b) => {
    const da = new Date(a.publishedAt).getTime();
    const db = new Date(b.publishedAt).getTime();
    return db - da;
  });

  if (__DEV__) {
    console.log("[fetchIssues] fetched issues length:", sorted.length);
    console.log("[fetchIssues] first issue object:", sorted[0] || null);
  }

  return sorted;
}

export async function fetchIssueById(id: string, lang: Language): Promise<AppIssue | null> {
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  const row = data as DbIssue;

  const coverPrimary =
    lang === "uz_cy"
      ? row.cover_image_cy_url || row.cover_image_url
      : row.cover_image_url || row.cover_image_cy_url;

  return {
    id: row.id,
    number: row.number ?? 0,
    title:
      localizeField(row as any, "title", lang) ||
      (row as any).title ||
      `Gazeta Soni #${row.number ?? ""}`,
    cover:
      coverPrimary ||
      row.cover_url ||
      "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800",
    pdfUrl: row.pdf_url ?? null,
    publishedAt: row.publish_date || row.published_at || new Date().toISOString(),
  };
}

export async function fetchIssueArticlesFull(
  issueId: string,
  lang: Language
): Promise<AppArticle[]> {
  const [cats, res] = await Promise.all([
    fetchRawCategories(),
    supabase
      .from("articles")
      .select("*")
      .eq("is_published", true)
      .eq("issue_id", issueId)
      .order("issue_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  if (res.error || !res.data) {
    const fallback = await supabase
      .from("articles")
      .select("*")
      .eq("is_published", true)
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true });

    if (fallback.error || !fallback.data) return [];
    return (fallback.data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
  }

  return (res.data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
}

export async function fetchAudioArticles(lang: Language): Promise<AppAudioItem[]> {
  const res = await supabase
    .from("articles")
    .select("*")
    .eq("is_published", true)
    .not("audio_url", "is", null)
    .neq("audio_url", "")   // also exclude empty-string audio_url
    .order("published_at", { ascending: false })
    .limit(30);

  if (res.error) {
    console.error("[fetchAudioArticles] Supabase error:", res.error.message);
    return [];
  }
  if (!res.data) return [];

  if (__DEV__) {
    console.log(
      "[fetchAudioArticles] fetched",
      res.data.length,
      "audio articles:",
      res.data.map((r: any) => ({
        id: r.id,
        audio_url: r.audio_url ?? "NULL",
        title: r.title_uz ?? r.title_ru ?? r.title_en ?? "—",
      }))
    );
  }

  return (res.data as DbArticle[]).map((row) => ({
    id: `aud-${row.id}`,
    articleId: row.id,
    title: localizeField(row as any, "title", lang) || "—",
    author: row.author_name || "Tahririyat",
    cover:
      row.featured_image_url ||
      "https://images.unsplash.com/photo-1524230572899-a752b3835840?w=800",
    durationSec: (row.read_time_minutes || 3) * 60,
    categoryId: row.category_id || "",
    audio_url: row.audio_url,
  }));
}

export async function fetchMediaItems(lang: Language): Promise<MediaFeedResult> {
  const cached = cachedMediaFeeds.get(lang);
  if (cached && Date.now() - cached.fetchedAt < MEDIA_FEED_TTL_MS) {
    return cached.data;
  }

  const existingRequest = inFlightMediaFeeds.get(lang);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchMediaFeed(lang)
    .then((result) => {
      cachedMediaFeeds.set(lang, { data: result, fetchedAt: Date.now() });
      return result;
    })
    .finally(() => {
      inFlightMediaFeeds.delete(lang);
    });

  inFlightMediaFeeds.set(lang, request);
  return request;
}

export async function fetchArticlesByIds(
  ids: string[],
  lang: Language
): Promise<AppArticle[]> {
  if (!ids.length) return [];
  const [cats, res] = await Promise.all([
    fetchRawCategories(),
    supabase
      .from("articles")
      .select("*")
      .in("id", ids)
      .eq("is_published", true),
  ]);

  if (res.error || !res.data) return [];
  return (res.data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
}

export async function searchArticles(
  query: string,
  lang: Language
): Promise<AppArticle[]> {
  if (!query.trim()) return [];
  const q = `%${query.trim()}%`;
  const [cats, res] = await Promise.all([
    fetchRawCategories(),
    supabase
      .from("articles")
      .select("*")
      .eq("is_published", true)
      .or(`title_uz.ilike.${q},title_ru.ilike.${q},title_en.ilike.${q},title_uz_cy.ilike.${q}`)
      .order("published_at", { ascending: false })
      .limit(30),
  ]);

  if (res.error || !res.data) return [];
  return (res.data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
}

export async function fetchEditorialRecommendations(
  lang: Language
): Promise<AppArticle[]> {
  try {
    const cats = await fetchRawCategories();

    // Fetch active recommendations joined with article data
    const { data, error } = await supabase
      .from("editorial_recommendations")
      .select("sort_order, articles(*)")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(10);

    if (error || !data) {
      if (__DEV__) console.warn("[fetchEditorialRecommendations] error:", error?.message);
      return [];
    }

    return (data as any[])
      .filter((row) => row.articles)
      .map((row) => normalizeArticle(row.articles as DbArticle, lang, cats));
  } catch (e) {
    if (__DEV__) console.error("[fetchEditorialRecommendations] exception:", e);
    return [];
  }
}

// ─── Engagement: Likes ───────────────────────────────────────────────────────

export async function fetchLikesCount(articleId: string): Promise<number> {
  try {
    // Fast path: read the denormalized counter column
    const { data } = await supabase
      .from("articles")
      .select("likes_count")
      .eq("id", articleId)
      .single();
    if (data != null && (data as any).likes_count != null) {
      return (data as any).likes_count as number;
    }
    // Fallback: count from the likes table (before triggers are active)
    const { count } = await supabase
      .from("article_likes")
      .select("id", { count: "exact", head: true })
      .eq("article_id", articleId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchUserLiked(
  userId: string,
  articleId: string
): Promise<boolean> {
  if (!userId || !articleId) return false;
  try {
    const { data } = await supabase
      .from("article_likes")
      .select("id")
      .eq("user_id", userId)
      .eq("article_id", articleId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function likeArticle(
  userId: string,
  articleId: string
): Promise<void> {
  if (!userId || !articleId) return;
  try {
    await supabase
      .from("article_likes")
      .upsert(
        { user_id: userId, article_id: articleId },
        { onConflict: "user_id,article_id", ignoreDuplicates: true }
      );
  } catch (e) {
    if (__DEV__) console.warn("[likeArticle] failed silently:", e);
  }
}

export async function unlikeArticle(
  userId: string,
  articleId: string
): Promise<void> {
  if (!userId || !articleId) return;
  try {
    await supabase
      .from("article_likes")
      .delete()
      .eq("user_id", userId)
      .eq("article_id", articleId);
  } catch (e) {
    if (__DEV__) console.warn("[unlikeArticle] failed silently:", e);
  }
}

// ─── Engagement: Comments ─────────────────────────────────────────────────────

export async function fetchComments(
  articleId: string,
  page = 0,
  pageSize = 10
): Promise<AppComment[]> {
  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("article_comments")
      .select("id, user_id, article_id, content, parent_id, author_name, created_at")
      .eq("article_id", articleId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error || !data) return [];

    const comments: AppComment[] = (data as any[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      articleId: row.article_id,
      content: row.content,
      parentId: row.parent_id,
      authorName: row.author_name || "Foydalanuvchi",
      createdAt: row.created_at,
      replies: [],
    }));

    if (comments.length > 0) {
      const commentIds = comments.map((c) => c.id);
      const { data: replyData } = await supabase
        .from("article_comments")
        .select("id, user_id, article_id, content, parent_id, author_name, created_at")
        .in("parent_id", commentIds)
        .order("created_at", { ascending: true });

      if (replyData) {
        const replies: AppComment[] = (replyData as any[]).map((row) => ({
          id: row.id,
          userId: row.user_id,
          articleId: row.article_id,
          content: row.content,
          parentId: row.parent_id,
          authorName: row.author_name || "Foydalanuvchi",
          createdAt: row.created_at,
          replies: [],
        }));
        for (const comment of comments) {
          comment.replies = replies.filter((r) => r.parentId === comment.id);
        }
      }
    }

    return comments;
  } catch (e) {
    if (__DEV__) console.warn("[fetchComments] failed silently:", e);
    return [];
  }
}

export async function addComment(
  userId: string,
  articleId: string,
  content: string,
  authorName: string,
  parentId?: string | null
): Promise<AppComment | null> {
  if (!userId || !content.trim()) return null;
  try {
    const { data, error } = await supabase
      .from("article_comments")
      .insert({
        user_id: userId,
        article_id: articleId,
        content: content.trim(),
        author_name: authorName,
        parent_id: parentId ?? null,
      })
      .select("id, user_id, article_id, content, parent_id, author_name, created_at")
      .single();

    if (error || !data) {
      if (__DEV__) console.warn("[addComment] error:", error?.message);
      return null;
    }

    return {
      id: (data as any).id,
      userId: (data as any).user_id,
      articleId: (data as any).article_id,
      content: (data as any).content,
      parentId: (data as any).parent_id,
      authorName: (data as any).author_name || "Foydalanuvchi",
      createdAt: (data as any).created_at,
      replies: [],
    };
  } catch (e) {
    if (__DEV__) console.warn("[addComment] failed silently:", e);
    return null;
  }
}

export async function fetchCommentsCount(articleId: string): Promise<number> {
  try {
    // Fast path: read the denormalized counter column
    const { data } = await supabase
      .from("articles")
      .select("comments_count")
      .eq("id", articleId)
      .single();
    if (data != null && (data as any).comments_count != null) {
      return (data as any).comments_count as number;
    }
    // Fallback: count from the comments table
    const { count } = await supabase
      .from("article_comments")
      .select("id", { count: "exact", head: true })
      .eq("article_id", articleId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ─── Engagement: View + Interest Tracking ────────────────────────────────────

export async function trackView(
  userId: string,
  articleId: string,
  categoryId: string,
  duration = 0
): Promise<void> {
  if (!userId || !articleId) return;
  try {
    await supabase
      .from("article_views")
      .insert({ user_id: userId, article_id: articleId, duration });
    if (categoryId) {
      await trackInterest(userId, categoryId);
    }
  } catch (e) {
    if (__DEV__) console.warn("[trackView] failed silently:", e);
  }
}

export async function trackInterest(
  userId: string,
  categoryId: string,
  delta = 1
): Promise<void> {
  if (!userId || !categoryId) return;

  const normalizedCategoryId = /^\d+$/.test(categoryId) ? Number(categoryId) : categoryId;
  const isMissingColumnError = (message?: string) => /column .* does not exist|schema cache|could not find/i.test(message ?? "");

  try {
    let existingResult = await supabase
      .from("user_interests")
      .select("id, score")
      .eq("user_id", userId)
      .eq("category", categoryId)
      .maybeSingle();

    let column: "category" | "category_id" = "category";
    if (existingResult.error && isMissingColumnError(existingResult.error.message)) {
      column = "category_id";
      existingResult = await supabase
        .from("user_interests")
        .select("id, score")
        .eq("user_id", userId)
        .eq("category_id", normalizedCategoryId)
        .maybeSingle();
    }

    const existing = existingResult.data as { id?: string; score?: number } | null;

    if (existing) {
      await supabase
        .from("user_interests")
        .update({ score: ((existing as any).score ?? 0) + delta })
        .eq("id", (existing as any).id);
    } else {
      await supabase
        .from("user_interests")
        .insert({ user_id: userId, [column]: column === "category" ? categoryId : normalizedCategoryId, score: delta });
    }
  } catch (e) {
    if (__DEV__) console.warn("[trackInterest] failed silently:", e);
  }
}

// ─── Personalized Feed ───────────────────────────────────────────────────────

export async function getPersonalizedArticles(
  userId: string,
  lang: Language
): Promise<AppArticle[]> {
  const cats = await fetchRawCategories();

  if (userId) {
    let interestsResult = await supabase
      .from("user_interests")
      .select("category, score")
      .eq("user_id", userId)
      .order("score", { ascending: false })
      .limit(5);

    let topCategories: string[] = [];
    if (!interestsResult.error && interestsResult.data) {
      topCategories = (interestsResult.data as any[]).map((item) => String(item.category)).filter(Boolean);
    } else {
      const fallbackResult = await supabase
        .from("user_interests")
        .select("category_id, score")
        .eq("user_id", userId)
        .order("score", { ascending: false })
        .limit(5);

      if (fallbackResult.data) {
        topCategories = (fallbackResult.data as any[]).map((item) => String(item.category_id)).filter(Boolean);
      }
    }

    if (topCategories.length > 0) {
      const { data } = await supabase
        .from("articles")
        .select("*")
        .eq("is_published", true)
        .in("category_id", topCategories)
        .order("view_count", { ascending: false, nullsFirst: false })
        .order("published_at", { ascending: false })
        .limit(10);

      if (data && (data as any[]).length > 0) {
        return (data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
      }
    }
  }

  // Fallback: most-viewed recent articles
  const { data } = await supabase
    .from("articles")
    .select("*")
    .eq("is_published", true)
    .order("view_count", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false })
    .limit(10);

  if (!data) return [];
  return (data as DbArticle[]).map((r) => normalizeArticle(r, lang, cats));
}

// ─── Social Settings ──────────────────────────────────────────────────────────

const SOCIAL_SETTINGS_TTL_MS = 5 * 60 * 1000;

let socialSettingsCache: { data: SocialSettings; fetchedAt: number } | null = null;
let socialSettingsInFlight: Promise<SocialSettings | null> | null = null;

export async function fetchSocialSettings(): Promise<SocialSettings | null> {
  const now = Date.now();

  if (socialSettingsCache && now - socialSettingsCache.fetchedAt < SOCIAL_SETTINGS_TTL_MS) {
    return socialSettingsCache.data;
  }

  if (socialSettingsInFlight) {
    return socialSettingsInFlight;
  }

  socialSettingsInFlight = (async (): Promise<SocialSettings | null> => {
    try {
      const { data, error } = await supabase
        .from("social_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      const settings = data as SocialSettings;
      socialSettingsCache = { data: settings, fetchedAt: Date.now() };
      return settings;
    } catch {
      return null;
    } finally {
      socialSettingsInFlight = null;
    }
  })();

  return socialSettingsInFlight;
}
