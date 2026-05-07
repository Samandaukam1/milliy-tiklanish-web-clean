import { useLanguage } from "@/providers/LanguageProvider";
import { localizeField } from "@/lib/services";

export type LocalizedArticle = {
  id: string;
  title?: string;
  title_uz?: string | null;
  title_uz_cy?: string | null;
  title_ru?: string | null;
  title_en?: string | null;
  summary?: string;
  summary_uz?: string | null;
  summary_uz_cy?: string | null;
  summary_ru?: string | null;
  summary_en?: string | null;
  content?: string;
  content_uz?: string | null;
  content_uz_cy?: string | null;
  content_ru?: string | null;
  content_en?: string | null;
  excerpt?: string;
  // other fields...
};

export function getLocalizedArticleField(
  article: LocalizedArticle,
  field: "title" | "summary" | "content",
  language: string
): string {
  const fieldKey = `${field}_${language}` as keyof LocalizedArticle;
  const fallbackKey = `${field}_uz` as keyof LocalizedArticle;
  const baseKey = field as keyof LocalizedArticle;

  const value = article[fieldKey] || article[fallbackKey] || article[baseKey];
  if (field === "summary") {
    return (value as string) || article.excerpt || "";
  }
  return (value as string) || "";
}

export type LocalizedBlock = {
  text_uz?: string | null;
  text_uz_cy?: string | null;
  text_ru?: string | null;
  text_en?: string | null;
  quote_uz?: string | null;
  quote_uz_cy?: string | null;
  quote_ru?: string | null;
  quote_en?: string | null;
  caption_uz?: string | null;
  caption_uz_cy?: string | null;
  caption_ru?: string | null;
  caption_en?: string | null;
};

export function getLocalizedBlockField(
  block: LocalizedBlock,
  field: "text" | "quote" | "caption",
  language: string
): string {
  return localizeField(block as Record<string, any>, field, language as any);
}

// Hook version
export function useLocalizedArticleField() {
  const { language } = useLanguage();

  return (article: LocalizedArticle, field: "title" | "summary" | "content") =>
    getLocalizedArticleField(article, field, language);
}

export function useLocalizedBlockField() {
  const { language } = useLanguage();

  return (block: LocalizedBlock, field: "text" | "quote" | "caption") =>
    getLocalizedBlockField(block, field, language);
}