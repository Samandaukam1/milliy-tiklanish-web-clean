// ─── Supabase DB Row Types ───────────────────────────────────────────────────

export type DbCategory = {
  id: string | number;
  name_uz: string | null;
  name_uz_cy: string | null;
  name_ru: string | null;
  name_en: string | null;
  slug: string | null;
  sort_order: number | null;
};

export type DbIssue = {
  id: string;
  number: number | null;
  title: string | null;
  title_uz: string | null;
  title_uz_cy: string | null;
  title_ru: string | null;
  title_en: string | null;
  cover_image_url: string | null;
  cover_image_cy_url: string | null;
  cover_url: string | null;
  pdf_url: string | null;
  publish_date: string | null;
  published_at: string | null;
  is_published: boolean | null;
};

export type DbArticle = {
  id: string;
  category_id: string | null;
  issue_id: string | null;
  author_name: string | null;
  slug: string | null;
  title_uz: string | null;
  title_uz_cy: string | null;
  title_ru: string | null;
  title_en: string | null;
  summary_uz: string | null;
  summary_uz_cy: string | null;
  summary_ru: string | null;
  summary_en: string | null;
  content_uz: string | null;
  content_uz_cy: string | null;
  content_ru: string | null;
  content_en: string | null;
  featured_image_url: string | null;
  audio_url: string | null;
  author_image_url: string | null;
  author_bio_uz: string | null;
  author_bio_uz_cy: string | null;
  author_bio_ru: string | null;
  author_bio_en: string | null;
  is_premium: boolean | null;
  is_featured: boolean | null;
  is_published: boolean | null;
  issue_order: number | null;
  published_at: string | null;
  read_time_minutes: number | null;
  created_at: string | null;
  view_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  category_hint: string | null;
};

export type DbArticleBlock = {
  id: string;
  article_id: string;
  type: string;
  sort_order: number | null;
  text_uz: string | null;
  text_uz_cy: string | null;
  text_ru: string | null;
  text_en: string | null;
  quote_uz: string | null;
  quote_uz_cy: string | null;
  quote_ru: string | null;
  quote_en: string | null;
  attribution: string | null;
  level: number | null;
  media_url: string | null;
  youtube_url: string | null;
  caption_uz: string | null;
  caption_uz_cy: string | null;
  caption_ru: string | null;
  caption_en: string | null;
};

export type DbMedia = {
  id: string;
  title: string | null;
  type: "short" | "long" | null;
  youtube_url: string | null;
  article_id: string | null;
  is_published: boolean | null;
  sort_order: number | null;
  created_at: string | null;
};

export type DbMediaVideo = {
  id: string;
  type: "short" | "long" | null;
  title: string | null;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  article_id?: string | number | null;
  linked_article_id?: string | number | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  youtube_url?: string | null;
  is_published?: boolean | null;
  sort_order?: number | null;
  created_at?: string | null;
  articles?: {
    id: string | number | null;
    title_uz: string | null;
    summary_uz: string | null;
    featured_image_url: string | null;
  } | null;
};

// ─── Normalized App Types (used by UI components) ────────────────────────────

export type AppIssue = {
  id: string;
  number: number;
  title: string;
  cover: string;
  pdfUrl: string | null;
  publishedAt: string;
};

export type AppAuthor = {
  name: string;
  imageUrl: string | null;
  articleCount: number;
  bio: string | null;
};

export type AppArticle = {
  id: string;
  title: string;
  excerpt: string;
  cover: string;
  categoryId: string;
  categoryName: string;
  authorName: string;
  publishedAt: string;
  readMinutes: number;
  tier: "free" | "premium";
  trending?: boolean;
  is_featured?: boolean;
  viewCount?: number | null;
  likesCount?: number;
  commentsCount?: number;
  audio_url?: string | null;
  slug?: string | null;
  issue_id?: string | null;
  // Raw localized fields for detail page
  title_uz?: string | null;
  title_uz_cy?: string | null;
  title_ru?: string | null;
  title_en?: string | null;
  summary_uz?: string | null;
  summary_uz_cy?: string | null;
  summary_ru?: string | null;
  summary_en?: string | null;
  content_uz?: string | null;
  content_uz_cy?: string | null;
  content_ru?: string | null;
  content_en?: string | null;
  // Author extended fields
  author_image_url?: string | null;
  author_bio_uz?: string | null;
  author_bio_uz_cy?: string | null;
  author_bio_ru?: string | null;
  author_bio_en?: string | null;
};

export type AppAudioItem = {
  id: string;
  articleId: string;
  title: string;
  author: string;
  cover: string;
  durationSec: number;
  categoryId: string;
  audio_url?: string | null;
};

export type AppMediaItem = {
  id: string;
  title: string;
  description: string;
  type: "short" | "long";
  source: "upload" | "youtube";
  video_url: string | null;
  youtube_url: string | null;
  linked_article_id: string | null;
  article_id: string | null;
  cover: string;
  thumbnail_url: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  articles?: {
    id: string | null;
    title_uz: string | null;
    summary_uz: string | null;
    featured_image_url: string | null;
  } | null;
  linkedArticle?: AppArticle | null;
};

export type AppMediaComment = {
  id: string;
  videoId: string;
  userId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export type AppCategory = {
  id: string;
  name: string;
  slug: string | null;
};

export type SubscriptionPlan = "free" | "premium" | "pro";

export type SubscriptionStatus = "active" | "expired" | "cancelled";

export type SubscriptionInfo = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  starts_at: string | null;
  expires_at: string | null;
};

export type AppBlock = {
  id: string;
  type: string;
  sort_order: number;
  text?: string;
  quote?: string;
  attribution?: string | null;
  level?: number | null;
  media_url?: string | null;
  youtube_url?: string | null;
  caption?: string | null;
};

export type UserProfile = {
  id: string;
  phone: string | null;
  phone_verified: boolean;
  telegram_verified?: boolean | null;
  telegram_verified_at: string | null;
  telegram_gateway_verified_at?: string | null;
  telegram_id?: string | null;
  telegram_username?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  login?: string | null;
  name: string | null;
  email?: string | null;
  avatar_url: string | null;
  provider?: string | null;
  subscription: SubscriptionPlan | string;
  subscription_info?: SubscriptionInfo | null;
  created_at: string;
  updated_at: string;
};

export type AppComment = {
  id: string;
  userId: string;
  articleId: string;
  content: string;
  parentId: string | null;
  authorName: string;
  createdAt: string;
  replies: AppComment[];
};

// ─── Social Settings ──────────────────────────────────────────────────────────

export type SocialSettings = {
  id: number;
  title_uz: string | null;
  title_uz_cy: string | null;
  title_ru: string | null;
  title_en: string | null;
  telegram_enabled: boolean;
  telegram_url: string | null;
  instagram_enabled: boolean;
  instagram_url: string | null;
  youtube_enabled: boolean;
  youtube_url: string | null;
  facebook_enabled: boolean;
  facebook_url: string | null;
  tiktok_enabled: boolean;
  tiktok_url: string | null;
  twitter_enabled: boolean;
  twitter_url: string | null;
};
