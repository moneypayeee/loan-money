/** KYC documents of one application: which files exist, their labels, and short-lived links to open them. */
import { supabase } from "@/lib/supabase";
import type { Application, Kyc, KycDocKey } from "@/lib/types";

/** View-only documents (can't be requested again through the re-upload flow). */
export type ExtraDocKey = "aadhaar_back" | "pan" | "driving" | "id_card" | "id_card_back";

export type KycDoc = { key: KycDocKey | ExtraDocKey; label: string; path: string | null; url?: string; pdf: boolean };

export function docLabel(key: KycDocKey, identityType = "ID") {
  return { identity: `${identityType} (front)`, identity_back: `${identityType} (back)`, address: "Aadhaar / address proof (front)", student: "Student ID" }[key];
}

const EXTRA_LABEL: Record<ExtraDocKey, string> = {
  aadhaar_back: "Aadhaar (back)",
  pan: "PAN card",
  driving: "Driving licence",
  id_card: "ID card / Voter ID (front)",
  id_card_back: "ID card / Voter ID (back)",
};

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
  const main: KycDoc[] = docKeys(a.category).map((key) => ({ key, label: docLabel(key, k.identity_type), path: paths[key], pdf: Boolean(paths[key]?.endsWith(".pdf")) }));
  // Extra uploads, skipping any file already shown above (e.g. the driving licence used as the main ID)
  const shown = new Set(main.map((d) => d.path).filter(Boolean));
  const extraPaths: [ExtraDocKey, string | null | undefined][] = [
    ["aadhaar_back", k.aadhaar_back_path],
    ["pan", k.pan_path],
    ["driving", k.driving_path],
    ["id_card", k.id_card_path],
    ["id_card_back", k.id_card_back_path],
  ];
  const extra: KycDoc[] = extraPaths
    .filter(([, path]) => path && !shown.has(path))
    .map(([key, path]) => ({ key, label: EXTRA_LABEL[key], path: path!, pdf: path!.endsWith(".pdf") }));
  return [...main, ...extra];
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
