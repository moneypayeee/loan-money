import { createClient } from "@supabase/supabase-js";
import { PAYMENT } from "@/config/site";

/** The application fee in rupees, read on the server (payment_settings.fee, else site config). Never trust the browser for this. */
export async function getApplicationFee(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    try {
      const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data } = await db.from("payment_settings").select("fee").eq("id", 1).maybeSingle();
      const fee = Number(data?.fee);
      if (Number.isInteger(fee) && fee > 0) return fee;
    } catch {
      // fall back to site config
    }
  }
  return PAYMENT.fee;
}

export function razorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, auth: Buffer.from(`${keyId}:${keySecret}`).toString("base64") };
}
