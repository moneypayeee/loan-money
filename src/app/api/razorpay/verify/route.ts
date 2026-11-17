import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getApplicationFee, razorpayCredentials } from "@/lib/razorpay-server";

/**
 * POST { order_id, payment_id, signature } → { verified: true, payment_id, utr }
 *
 * 1. Checks Razorpay's checkout signature (HMAC-SHA256 of "order_id|payment_id" with the key secret).
 * 2. Fetches the payment from Razorpay and checks it belongs to this order, succeeded, and was for the full fee.
 * 3. Records it in public.razorpay_payments (service role) so admins can see it was genuinely paid online.
 */
export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };
const ID_RE = /^[A-Za-z0-9_]{6,64}$/;

function fail(error: string, status = 400) {
  return NextResponse.json({ verified: false, error }, { status, ...noStore });
}

export async function POST(req: Request) {
  const creds = razorpayCredentials();
  if (!creds) return fail("Razorpay credentials are not configured on the server.", 500);

  let order_id = "";
  let payment_id = "";
  let signature = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    order_id = typeof body.order_id === "string" ? body.order_id : "";
    payment_id = typeof body.payment_id === "string" ? body.payment_id : "";
    signature = typeof body.signature === "string" ? body.signature : "";
  } catch {
    return fail("Bad request.");
  }
  if (!ID_RE.test(order_id) || !ID_RE.test(payment_id) || !/^[0-9a-f]{64}$/i.test(signature)) {
    return fail("Bad request.");
  }

  // 1. Signature check
  const expected = createHmac("sha256", creds.keySecret).update(`${order_id}|${payment_id}`).digest();
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return fail("Payment could not be verified. If money was deducted, contact support with your payment ID.");
  }

  // 2. Confirm with Razorpay: right order, successful, full fee
  let payment: { order_id?: string; status?: string; amount?: number; currency?: string };
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(payment_id)}`, {
      headers: { Authorization: `Basic ${creds.auth}` },
      cache: "no-store",
    });
    payment = await res.json();
    if (!res.ok) return fail("Could not confirm the payment with Razorpay. Please try again.", 502);
  } catch {
    return fail("Could not reach Razorpay to confirm the payment. Please try again.", 502);
  }

  const fee = await getApplicationFee();
  if (payment.order_id !== order_id) return fail("Payment does not match this order.");
  if (payment.status !== "captured" && payment.status !== "authorized") {
    return fail("Payment has not completed yet. Please wait a moment and try again.");
  }
  if (payment.currency !== "INR" || Number(payment.amount) < fee * 100) {
    return fail("Payment amount does not match the application fee.");
  }

  // 3. Record it (best effort — verification already passed)
  const utr = payment_id.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && service) {
    try {
      const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await admin.from("razorpay_payments").upsert(
        { payment_id, utr, order_id, amount_paise: Number(payment.amount), status: String(payment.status) },
        { onConflict: "payment_id" }
      );
      if (error) console.error("razorpay_payments insert failed:", error.message);
    } catch (e) {
      console.error("razorpay_payments insert failed:", e);
    }
  }

  return NextResponse.json({ verified: true, payment_id, utr }, noStore);
}
