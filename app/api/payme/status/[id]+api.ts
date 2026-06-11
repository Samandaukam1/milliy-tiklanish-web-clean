import {
  buildPaymentStatusPayload,
  createPaymentsAdminClient,
  getPaymentById,
  isSupabasePaymentServerConfigured,
} from "@/lib/server/payme";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  if (!isSupabasePaymentServerConfigured()) {
    return Response.json({ error: "Server configuration error" }, { status: 503 });
  }

  const paymentId = params?.id?.trim();
  if (!paymentId) {
    return Response.json({ error: "Missing payment id" }, { status: 400 });
  }

  try {
    const admin = createPaymentsAdminClient();
    const payment = await getPaymentById(admin, paymentId);
    if (!payment) {
      return Response.json({ error: "Payment not found" }, { status: 404 });
    }

    return Response.json(await buildPaymentStatusPayload(admin, payment));
  } catch (error) {
    console.error("[Payme status] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}