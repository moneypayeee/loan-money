import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PAYMENT } from "@/config/site";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function resolveQrUrl(qrPath: string | null | undefined, supabaseUrl?: string) {
  if (!qrPath) return null;
  // Local static fallback (e.g. payment-qr.svg in public/)
  if (qrPath === "payment-qr.svg" || qrPath.startsWith("/")) {
    return qrPath.startsWith("/") ? qrPath : `/${qrPath}`;
  }
  if (supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/payment-qr/${qrPath}`;
  }
  return `/${qrPath}`;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (url && key) {
    try {
      const db = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await db
        .from("payment_settings")
        .select("payee_name, upi_id, fee, qr_path, updated_at")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) {
        const payee_name = data.payee_name || PAYMENT.payee_name;
        const upi_id = data.upi_id || PAYMENT.upi_id;
        const qr_path = data.qr_path || PAYMENT.qr_path;
        return NextResponse.json({
          payee_name,
          upi_id,
          fee: typeof data.fee === "number" ? data.fee : (data.fee !== null && data.fee !== undefined ? Number(data.fee) : PAYMENT.fee),
          qr_path,
          qr_url: resolveQrUrl(qr_path, url),
          updated_at: data.updated_at,
        });
      }
    } catch {
      // Fall through to site config
    }
  }

  return NextResponse.json({
    ...PAYMENT,
    qr_url: resolveQrUrl(PAYMENT.qr_path, url),
  });
}

export async function POST(req: Request) {
  try {
    const db = getAdminClient();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!db || !url) {
      return NextResponse.json(
        { error: "Supabase service credentials are not configured." },
        { status: 503 }
      );
    }

    // Verify caller is an authenticated admin
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
    }
    const { data: userData, error: authErr } = await db.auth.getUser(token);
    if (authErr || !userData?.user) {
      return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }
    const { data: adminRow } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!adminRow) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { payee_name, upi_id, qr_base64, fee } = body;

    const { data: current } = await db
      .from("payment_settings")
      .select("qr_path, payee_name, upi_id, fee")
      .eq("id", 1)
      .maybeSingle();

    let qr_path = current?.qr_path || PAYMENT.qr_path;

    if (qr_base64) {
      const match = String(qr_base64).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
      const mime = match ? match[1].toLowerCase() : "image/png";
      const base64Data = match ? match[2] : String(qr_base64).replace(/^data:image\/\w+;base64,/, "");
      const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
      const buffer = Buffer.from(base64Data, "base64");
      const objectPath = `qr-${Date.now()}.${ext}`;

      const { error: uploadErr } = await db.storage
        .from("payment-qr")
        .upload(objectPath, buffer, { contentType: mime, upsert: true });

      if (uploadErr) {
        return NextResponse.json(
          { error: `Failed to upload QR image: ${uploadErr.message}` },
          { status: 500 }
        );
      }
      qr_path = objectPath;
    }

    const updatedPayee = String(payee_name || current?.payee_name || PAYMENT.payee_name).trim();
    const updatedUpi = String(upi_id || current?.upi_id || PAYMENT.upi_id).trim().toLowerCase();
    let updatedFee = current?.fee ?? PAYMENT.fee;
    if (fee !== undefined && fee !== null && fee !== "") {
      const n = Number(fee);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        return NextResponse.json({ error: "The fee must be a whole number of rupees between ₹1 and ₹1,00,000." }, { status: 400 });
      }
      updatedFee = n;
    }
    const updatedAt = new Date().toISOString();

    const { error: updateErr } = await db
      .from("payment_settings")
      .update({
        payee_name: updatedPayee,
        upi_id: updatedUpi,
        fee: updatedFee,
        qr_path,
        updated_at: updatedAt,
      })
      .eq("id", 1);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      payment: {
        payee_name: updatedPayee,
        upi_id: updatedUpi,
        fee: updatedFee,
        qr_path,
        qr_url: resolveQrUrl(qr_path, url),
        updated_at: updatedAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update payment settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
