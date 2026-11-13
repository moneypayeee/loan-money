/** KYC documents of one application: which files exist, their labels, and short-lived links to open them. */
import { supabase } from "@/lib/supabase";
import type { Application, Kyc, KycDocKey } from "@/lib/types";

export type KycDoc = { key: KycDocKey; label: string; path: string | null; url?: string; pdf: boolean };

export function docLabel(key: KycDocKey, identityType = "ID") {
  return { identity: `${identityType} (front)`, identity_back: `${identityType} (back)`, address: "Address proof", student: "Student ID" }[key];
}

/** Documents this application can have (back of ID is optional; student ID only for students). */
export function docKeys(category: string): KycDocKey[] {
  return category === "Student" ? ["identity", "identity_back", "address", "student"] : ["identity", "identity_back", "address"];
}

export function docList(a: Application, k: Kyc): KycDoc[] {
  const paths: Record<KycDocKey, string | null> = {
    identity: k.identity_path,
    identity_back: k.identity_back_path,
    address: k.address_path,
    student: k.student_path,
  };
  return docKeys(a.category).map((key) => ({ key, label: docLabel(key, k.identity_type), path: paths[key], pdf: Boolean(paths[key]?.endsWith(".pdf")) }));
}

/** Loads KYC details and 5-minute signed links for each uploaded document. */
export async function loadKyc(a: Application): Promise<{ kyc: Kyc | null; docs: KycDoc[] }> {
  if (!supabase) return { kyc: null, docs: [] };
  const { data, error } = await supabase.from("application_kyc").select("*").eq("application_id", a.id).maybeSingle();
  if (error) throw error;
  if (!data) return { kyc: null, docs: [] };
  const kyc = data as Kyc;
  const docs = docList(a, kyc);
  const withPath = docs.filter((d) => d.path);
  if (withPath.length) {
    const { data: signed, error: e2 } = await supabase.storage.from("kyc-documents").createSignedUrls(
      withPath.map((d) => d.path!),
      300,
    );
    if (e2) throw e2;
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const d of docs) if (d.path) d.url = byPath.get(d.path) ?? undefined;
  }
  return { kyc, docs };
}

/** Age in whole years on `today` (YYYY-MM-DD). */
export function ageOn(dob: string, today: string) {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
