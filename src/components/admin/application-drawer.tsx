"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, FileText, ImageIcon, Loader2, MessageCircle, RotateCcw, ScanFace, UserRound, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSettings } from "@/lib/settings-context";
import { addDays, appRef, dateOnly, dateTime, errorText, rupees } from "@/lib/format";
import type { Application, ApplicationEvent, Kyc } from "@/lib/types";
import { Notice, StatusBadge } from "../ui";
import { formatPhone } from "@/lib/phone-auth";
import { buildTimeline, Timeline } from "../apply/application-card";
import type { AdminCtx } from "./admin-console";
import { ApprovalShare } from "./approval-share";
import { DEMO_KYC } from "./demo-data";
import { LoanPanel } from "./loan-panel";
import { whatsappLink } from "./portfolio";

type Doc = { label: string; url: string; pdf: boolean };

export function ApplicationDrawer({ app: a, ctx, onClose }: { app: Application; ctx: AdminCtx; onClose: () => void }) {
  const { site } = useSettings();
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [kyc, setKyc] = useState<Kyc | null | undefined>(undefined);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [paid, setPaid] = useState<boolean | null>(null);
  const [note, setNote] = useState(a.status === "pending" && a.kyc_status === "problem" ? a.kyc_note : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("application_events")
      .select("id,application_id,kind,note,created_at")
      .eq("application_id", a.id)
      .order("created_at")
      .then(({ data }) => setEvents((data ?? []) as ApplicationEvent[]));
  }, [a.id, a.status]);

  // Was this UTR a Razorpay payment confirmed by our server? (null = not found / table not set up)
  const [rzp, setRzp] = useState<{ amount_paise: number; status: string; verified_at: string } | null>(null);
  useEffect(() => {
    setRzp(null);
    if (!supabase || !a.transaction_id) return;
    void supabase
      .from("razorpay_payments")
      .select("amount_paise,status,verified_at")
      .eq("utr", a.transaction_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setRzp(data as { amount_paise: number; status: string; verified_at: string });
      });
  }, [a.transaction_id]);

  async function loadDocs() {
    if (ctx.demo) {
      setKyc({ ...DEMO_KYC, institution: a.category === "Student" ? "St. Xavier's College, Mumbai" : null, identity_type: a.category === "Driver" ? "Driving licence" : "Voter ID" });
      return;
    }
    if (!supabase) return;
    setLoadingDocs(true);
    setErr("");
    try {
      const sign = async (bucket: string, path: string) => {
        const { data, error } = await supabase!.storage.from(bucket).createSignedUrl(path, 300);
        if (error) throw error;
        return data.signedUrl;
      };
      setProofUrl(await sign("payment-proofs", a.proof_path));
      const { data, error } = await supabase.from("application_kyc").select("*").eq("application_id", a.id).maybeSingle();
      if (error) throw error;
      setKyc((data as Kyc) ?? null);
      if (data) {
        const k = data as Kyc;
        const list: [string, string | null | undefined][] = [
          [`Main ID: ${k.identity_type} — front`, k.identity_path],
          [`Main ID: ${k.identity_type} — back`, k.identity_back_path],
          ["Aadhaar Card — front", k.address_path],
          ["Aadhaar Card — back", k.aadhaar_back_path],
          ["PAN Card", k.pan_path],
          ["Driving Licence", k.driving_path],
          ["ID Card / Voter ID — front", k.id_card_path],
          ["ID Card / Voter ID — back", k.id_card_back_path],
          ["Student ID", k.student_path],
        ];
        const signed: Doc[] = [];
        const seen = new Set<string>();
        for (const [label, path] of list) {
          if (!path || seen.has(path)) continue; // the same file can fill two slots (e.g. licence used as main ID)
          seen.add(path);
          signed.push({ label, url: await sign("kyc-documents", path), pdf: path.endsWith(".pdf") });
        }
        setDocs(signed);
      }
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setLoadingDocs(false);
    }
  }

  const kycOk = a.kyc_status === "verified";

  function demoError(decision: "accepted" | "rejected") {
    if (decision === "accepted" && !kycOk) return "Verify the KYC documents in the KYC tab before approving.";
    if (decision === "accepted" && paid !== true) return "Confirm the payment was received before approving.";
    if (decision === "rejected" && note.trim().length < 3) return "Give the applicant a reason for rejection.";
    return "";
  }

  async function decide(decision: "accepted" | "rejected") {
    if (ctx.demo) {
      const e = demoError(decision);
      if (e) return setErr(e);
      ctx.patch(a.id, {
        status: decision,
        payment_verified: paid === true,
        kyc_verified: kycOk,
        admin_note: note.trim(),
        reviewed_at: new Date().toISOString(),
        refund_status: "not_applicable",
      });
      ctx.toast("ok", `Demo: ${a.full_name} ${decision === "accepted" ? "approved" : "declined"}. Not saved.`);
      return;
    }
    if (!supabase) return;
    setBusy(decision);
    setErr("");
    const { error } = await supabase.rpc("admin_review_application", {
      p_id: a.id,
      p_decision: decision,
      p_payment_received: paid === true,
      p_kyc_verified: kycOk,
      p_note: note,
    });
    setBusy(null);
    if (error) return setErr(errorText(error));
    ctx.toast(
      "ok",
      decision === "accepted"
        ? `${a.full_name}'s application approved.`
        : `${a.full_name}'s application declined.`,
    );
    await ctx.reload();
  }

  const opened = kyc !== undefined;
  const company = site?.company_name ?? "MoneyPayee";
  const first = a.full_name.split(" ")[0];
  const waText =
    a.status === "pending"
      ? `Hello ${first}, this is ${company}. We have received your loan application ${appRef(a)} and it is being reviewed for an instant loan in 48 hours.`
      : a.status === "accepted"
        ? `Hello ${first}, this is ${company}. Good news: your application ${appRef(a)} has been approved and passed to ${a.lender_name ?? site?.lender_name ?? "our lending partner"}, who will contact you with the loan offer.`
        : `Hello ${first}, this is ${company}. Your application ${appRef(a)} was not approved: ${a.admin_note}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Application from ${a.full_name}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-[#07100a] shadow-2xl animate-[rise_.35s_cubic-bezier(.16,1,.3,1)_both]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b hairline bg-white/[0.02] px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs text-muted">{formatPhone(a.phone)} · {a.category}</p>
            <h2 className="display mt-1 truncate text-2xl">{a.full_name}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={a.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => ctx.openCustomer(a.user_id)}>
                <UserRound size={14} /> Customer profile
              </button>
              <a className="btn btn-outline btn-sm" href={whatsappLink(a.phone, waText)} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={14} /> WhatsApp update
              </a>
            </div>
            {a.status === "accepted" && (
              <div className="mt-3">
                <ApprovalShare app={a} ctx={ctx} email={a.contact_email || (kyc as { email?: string } | null | undefined)?.email} />
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
          {err && <Notice tone="bad" onClose={() => setErr("")}>{err}</Notice>}

          <Section title="Applicant">
            {(() => {
              const rows: [string, React.ReactNode][] = [
                ["Requested", rupees(a.requested_amount)],
                ["Category", a.category],
                ["Mobile", <a key="p" className="text-brand hover:underline" href={`tel:+91${a.phone}`}>+91 {a.phone}</a>],
              ];
              if ((kyc as any)?.alt_phone) {
                rows.push(["Alt Mobile", <a key="ap" className="text-brand hover:underline" href={`tel:+91${(kyc as any).alt_phone}`}>+91 {(kyc as any).alt_phone}</a>]);
              }
              if (a.contact_email || (kyc as any)?.email) {
                rows.push(["Email ID", String(a.contact_email || (kyc as any)?.email)]);
              }
              rows.push(["Submitted", dateTime(a.created_at)]);
              if (kyc) {
                rows.push(["Date of birth", kyc.dob]);
                rows.push(["Main ID", `${kyc.identity_type} ···· ${kyc.identity_last4}`]);
              }
              return <Grid rows={rows} />;
            })()}
            {kyc && (
              <p className="mt-3 rounded-lg bg-paper px-3 py-2.5 text-sm leading-relaxed">
                {kyc.address}, {kyc.city}, {kyc.state} {kyc.pincode}
                {kyc.institution && <span className="mt-1 block text-muted">Institution: {kyc.institution}</span>}
              </p>
            )}
          </Section>

          <Section title="Payment">
            <Grid
              rows={[
                ["Fee", `₹${a.fee}`],
                ["UTR", <CopyText key="u" text={a.transaction_id} />],
                [
                  "Razorpay",
                  rzp ? (
                    <span key="rz" className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                      <Check className="size-3.5" /> Verified by Razorpay · {rupees(Math.round(rzp.amount_paise / 100))} · {dateTime(rzp.verified_at)}
                    </span>
                  ) : (
                    <span key="rz" className="text-muted">Not a verified Razorpay payment — check the UTR manually</span>
                  ),
                ],
                ["Paid to", `${a.payee_name} · ${a.upi_id}`],
                ["Applicant UPI", a.refund_upi_id ? <CopyText key="r" text={a.refund_upi_id} /> : "—"],
              ]}
            />
            <p className="mt-3 text-xs leading-relaxed text-muted">
              A screenshot alone doesn&rsquo;t prove payment. Match the UTR and amount in the receiving account before confirming.
            </p>
          </Section>

          <Section
            title="Documents"
            action={
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void loadDocs()} disabled={loadingDocs}>
                {loadingDocs ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {opened ? "Refresh links" : "Open documents"}
              </button>
            }
          >
            {!opened ? (
              <p className="text-sm text-muted">Private links are created on demand and expire after five minutes.</p>
            ) : ctx.demo ? (
              <Notice tone="info">Demo mode: KYC details are sample data. With Supabase connected, the payment screenshot and each uploaded document open here.</Notice>
            ) : (
              <div className="space-y-3">
                {proofUrl && (
                  <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border hairline bg-navy">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proofUrl} alt="Payment screenshot" className="max-h-72 w-full object-contain" />
                    <span className="flex items-center gap-2 bg-white/[0.04] px-3 py-2 text-xs font-semibold">
                      <ImageIcon size={14} /> Payment screenshot <ExternalLink size={12} className="ml-auto text-muted" />
                    </span>
                  </a>
                )}
                {kyc === null ? (
                  <Notice tone="warn">No KYC documents are attached to this application, so it can&rsquo;t be approved.</Notice>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {docs.map((d) => (
                      <a key={d.label} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border hairline bg-white/[0.02] p-3 text-sm font-semibold hover:border-brand/50">
                        <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                          <FileText size={16} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{d.label}</span>
                        <span className="text-[0.65rem] font-bold uppercase text-faint">{d.pdf ? "PDF" : "IMG"}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Decision */}
          {a.status === "pending" && (
            <Section title="Decision">
              <fieldset className="space-y-2">
                <legend className="label">Was ₹{a.fee} received in the account for UTR {a.transaction_id}?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Choice checked={paid === true} onClick={() => setPaid(true)} label="Yes, payment found" />
                  <Choice checked={paid === false} onClick={() => setPaid(false)} label="No, payment not found" />
                </div>
              </fieldset>
              <div
                className={`mt-4 flex flex-col gap-3 rounded-xl border p-3.5 text-sm sm:flex-row sm:items-center sm:justify-between ${
                  kycOk ? "border-ok/30 bg-ok-soft/60" : a.kyc_status === "problem" ? "border-bad/30 bg-bad-soft/60" : "hairline bg-white/[0.02]"
                }`}
              >
                <span className="flex items-start gap-2.5">
                  <ScanFace size={17} className={`mt-0.5 shrink-0 ${kycOk ? "text-ok" : a.kyc_status === "problem" ? "text-bad" : "text-gold"}`} />
                  <span>
                    <strong>
                      {kycOk ? "KYC verified" : a.kyc_status === "problem" ? "KYC problem found" : a.kyc_status === "resubmit" ? "Waiting for a new document" : "KYC not verified yet"}
                    </strong>
                    <span className="block text-xs text-muted">
                      {kycOk
                        ? `Checked ${a.kyc_reviewed_at ? dateTime(a.kyc_reviewed_at) : ""}`
                        : a.kyc_status === "problem" || a.kyc_status === "resubmit"
                          ? a.kyc_note
                          : "Documents are checked in the KYC tab before approval."}
                    </span>
                  </span>
                </span>
                <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={() => ctx.openKyc(a.id)}>
                  {kycOk ? "View KYC" : "Check KYC"}
                </button>
              </div>
              <div className="mt-4">
                <label className="label" htmlFor="decision-note">
                  Note to applicant <span className="font-normal text-muted">(required to decline)</span>
                </label>
                <textarea id="decision-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Address proof is older than 3 months. Please reapply with a recent bill." />
              </div>
              {!(paid === true && kycOk) && (
                <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                  <p className="text-xs font-semibold text-ink-2">To approve, complete these steps:</p>
                  <ol className="mt-2 space-y-1.5 text-xs">
                    {(
                      [
                        [kycOk, "Verify KYC in the KYC tab"],
                        [paid === true, "Choose “Yes, payment found”"],
                      ] as const
                    ).map(([done, label], i) => (
                      <li key={label} className={`flex items-center gap-2 ${done ? "text-ok" : "text-muted"}`}>
                        <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[0.6rem] font-bold ${done ? "bg-ok text-paper" : "border border-white/20"}`}>
                          {done ? <Check size={10} strokeWidth={3} /> : i + 1}
                        </span>
                        {label}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button type="button" className="btn btn-ok" disabled={!!busy || paid !== true || !kycOk} onClick={() => void decide("accepted")}>
                  {busy === "accepted" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve
                </button>
                <button type="button" className="btn btn-bad" disabled={!!busy || paid === null || note.trim().length < 3} onClick={() => void decide("rejected")}>
                  {busy === "rejected" ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />} Decline
                </button>
              </div>
            </Section>
          )}

          {a.status === "accepted" && <LoanPanel app={a} ctx={ctx} />}

          <Section title="Timeline">
            <Timeline steps={buildTimeline(a, events)} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Grid({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:gap-x-6">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 break-words font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Choice({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-semibold transition ${checked ? "border-gold/50 bg-gold-soft text-gold-ink" : "hairline bg-white/[0.02] hover:border-white/25"}`}
    >
      <span className={`grid size-4 place-items-center rounded-full border-2 ${checked ? "border-gold" : "border-line-strong"}`}>{checked && <span className="size-1.5 rounded-full bg-gold" />}</span>
      {label}
    </button>
  );
}

function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 font-mono text-[0.82rem] hover:text-brand"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {text} {done ? <Check size={13} className="text-ok" /> : <Copy size={13} className="text-faint" />}
    </button>
  );
}
