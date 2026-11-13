"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/format";
import type { Application, KycDocKey } from "@/lib/types";
import { FileDrop } from "../file-drop";
import { Notice } from "../ui";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };
const LABEL: Record<KycDocKey, [string, string]> = {
  identity: ["ID document (front)", "Photo page or front side · up to 5 MB"],
  identity_back: ["ID document (back)", "The back side · up to 5 MB"],
  address: ["Address proof", "Utility bill, bank statement or rent agreement, less than 3 months old"],
  student: ["Student ID", "Clear photo of the front · up to 5 MB"],
};

/** Shown on the applicant's application when the reviewer asked for a document again. */
export function KycReupload({ a, userId, onDone }: { a: Application; userId: string; onDone: () => void }) {
  const [files, setFiles] = useState<Partial<Record<KycDocKey, File | null>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = a.kyc_requested_docs.every((k) => files[k]);

  async function send() {
    setErr("");
    if (!ready) return setErr("Add every document listed below.");
    if (!supabase) return;
    setBusy(true);
    try {
      const paths: Partial<Record<KycDocKey, string>> = {};
      for (const k of a.kyc_requested_docs) {
        const f = files[k]!;
        const path = `${userId}/${crypto.randomUUID()}.${EXT[f.type] ?? "bin"}`;
        const { error } = await supabase.storage.from("kyc-documents").upload(path, f, { contentType: f.type, upsert: false });
        if (error) throw error;
        paths[k] = path;
      }
      const { error } = await supabase.rpc("applicant_resubmit_kyc", { p_id: a.id, p_docs: paths });
      if (error) throw error;
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-b hairline bg-gold-soft/40 px-5 py-5 sm:px-7">
      <p className="flex items-center gap-2 font-semibold text-gold-ink">
        <Upload size={16} /> We need a new document from you
      </p>
      {a.kyc_note && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">&ldquo;{a.kyc_note}&rdquo;</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {a.kyc_requested_docs.map((k) => (
          <FileDrop key={k} id={`reupload-${k}`} label={LABEL[k][0]} hint={LABEL[k][1]} required file={files[k] ?? null} onChange={(f) => setFiles((x) => ({ ...x, [k]: f }))} />
        ))}
      </div>
      {err && (
        <div className="mt-3">
          <Notice tone="bad" onClose={() => setErr("")}>
            {err}
          </Notice>
        </div>
      )}
      <button type="button" className="btn btn-dark mt-4" disabled={busy || !ready} onClick={() => void send()}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Send {a.kyc_requested_docs.length > 1 ? "documents" : "document"}
      </button>
      <p className="mt-2 text-xs text-muted">Your application stays in the queue. We&rsquo;ll check the new document and continue the review.</p>
    </section>
  );
}
