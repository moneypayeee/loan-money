// Copies the fixed values in src/config/site.ts into the database, which uses them
// to accept applications (lender check, payee recorded on each application).
// Run after every edit of src/config/site.ts:   npm run sync-settings
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PAYMENT, SITE } from "../src/config/site.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const site = await db.from("site_settings").update({ ...SITE, updated_at: new Date().toISOString() }).eq("id", 1).select("id");
if (site.error || !site.data?.length) throw new Error("site_settings: " + (site.error?.message ?? "row 1 missing — run supabase/schema.sql"));

const { fee: _fee, ...payment } = PAYMENT; // fee is fixed at ₹299 by the database
const pay = await db.from("payment_settings").update({ ...payment, updated_at: new Date().toISOString() }).eq("id", 1).select("id");
if (pay.error || !pay.data?.length) throw new Error("payment_settings: " + (pay.error?.message ?? "row 1 missing — run supabase/schema.sql"));

console.log("✓ Settings copied to the database.");
const missing = [
  ...["lender_name", "lender_reg_no", "grievance_officer", "grievance_email"].filter((k) => !String(SITE[k]).trim()),
  ...["payee_name", "upi_id"].filter((k) => !String(PAYMENT[k]).trim()),
];
if (PAYMENT.qr_path && !existsSync(new URL(`../public/${PAYMENT.qr_path}`, import.meta.url))) missing.push(`QR image public/${PAYMENT.qr_path}`);
if (missing.length) console.log("⚠ Still empty, so applications stay closed:", missing.join(", "));
else console.log("✓ Everything is filled in. Applications are open.");
