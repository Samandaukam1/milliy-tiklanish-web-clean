import {
  createPaymentsAdminClient,
  isSupabasePaymentServerConfigured,
  resolveArticleAccess,
} from "@/lib/server/payme";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  if (!isSupabasePaymentServerConfigured()) {
    return Response.json({ allowed: false, source: "none" }, { status: 200 });
  }

  const articleId = params?.id?.trim();
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id")?.trim() || null;

  if (!articleId || !userId) {
    return Response.json({ allowed: false, source: "none" }, { status: 200 });
  }

  try {
    const admin = createPaymentsAdminClient();
    return Response.json(await resolveArticleAccess(admin, { userId, articleId }));
  } catch (error) {
    console.error("[Payme article-access] error:", error);
    return Response.json({ allowed: false, source: "none" }, { status: 200 });
  }
}