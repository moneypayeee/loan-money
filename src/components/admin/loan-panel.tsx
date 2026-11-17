"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2, ReceiptText, Save, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dateOnly, errorText } from "@/lib/format";
import {
  DOCUMENT_KINDS,
  type Application,
  type Loan,
  type LoanDocument,
  type LoanDocumentKind,
  type LoanPayment,
  type LoanStatus,
  type RepaymentMethod,
} from "@/lib/types";
import { emi } from "@/lib/loan-math";
import { Notice } from "../ui";
import type { AdminCtx } from "./admin-console";

type Form = {
  loan_account_no: string;
  sanctioned_amount: string;
  interest_rate: string;
  tenure_months: string;
  first_emi_date: string;
  disbursed_on: string;
  status: LoanStatus;
  note: string;
  disbursed_amount: string;
  disbursed_to: string;
  processing_fee: string;
  apr: string;
  late_fee: string;
  prepayment_terms: string;
  repayment_method: RepaymentMethod;
  repayment_details: string;
  repayment_link: string;
};

const EMPTY: Form = {
  loan_account_no: "",
  sanctioned_amount: "",
  interest_rate: "",
  tenure_months: "",
  first_emi_date: "",
  disbursed_on: "",
  status: "sanctioned",
  note: "",
  disbursed_amount: "",
  disbursed_to: "",
  processing_fee: "",
  apr: "",
  late_fee: "",
  prepayment_terms: "",
  repayment_method: "",
  repayment_details: "",
  repayment_link: "",
};

const str = (v: unknown) => (v == null ? "" : String(v));
const today = () => new Date().toISOString().slice(0, 10);

function fromLoan(l: Loan): Form {
  return {
    loan_account_no: l.loan_account_no ?? "",
    sanctioned_amount: str(l.sanctioned_amount),
    interest_rate: l.interest_rate != null ? String(Number(l.interest_rate)) : "",
    tenure_months: str(l.tenure_months),
    first_emi_date: l.first_emi_date ?? "",
    disbursed_on: l.disbursed_on ?? "",
    status: l.status,
    note: l.note ?? "",
    disbursed_amount: str(l.disbursed_amount),
    disbursed_to: l.disbursed_to ?? "",
    processing_fee: str(l.processing_fee),
    apr: l.apr != null ? String(Number(l.apr)) : "",
    late_fee: l.late_fee ?? "",
    prepayment_terms: l.prepayment_terms ?? "",
    repayment_method: l.repayment_method ?? "",
    repayment_details: l.repayment_details ?? "",
    repayment_link: l.repayment_link ?? "",
  };
}

/** Form → Loan (demo mode only; live mode reads the saved row back from the database). */
function toLoan(id: string, f: Form): Loan {
  const n = (v: string) => (v === "" ? null : Number(v));
  return {
    application_id: id,
    loan_account_no: f.loan_account_no,
    sanctioned_amount: n(f.sanctioned_amount),
    interest_rate: n(f.interest_rate),
    tenure_months: n(f.tenure_months),
    emi_amount: emi(Number(f.sanctioned_amount), Number(f.interest_rate), Number(f.tenure_months)) || null,
    first_emi_date: f.first_emi_date || null,
    disbursed_on: f.disbursed_on || null,
    status: f.status,
    note: f.note,
    updated_at: new Date().toISOString(),
    disbursed_amount: n(f.disbursed_amount),
    disbursed_to: f.disbursed_to,
    processing_fee: n(f.processing_fee),
    apr: n(f.apr),
    late_fee: f.late_fee,
    prepayment_terms: f.prepayment_terms,
    repayment_method: f.repayment_method,
    repayment_details: f.repayment_details,
    repayment_link: f.repayment_link,
  };
}


type Tab = "loan" | "docs";
const TABS: { id: Tab; label: string; icon: typeof ReceiptText }[] = [
  { id: "loan", label: "Loan", icon: ReceiptText },
  { id: "docs", label: "Documents", icon: FileText },
];

export function LoanPanel({ app, ctx }: { app: Application; ctx: AdminCtx }) {
  const live = !ctx.demo && Boolean(supabase);
  const [tab, setTab] = useState<Tab>("loan");
  // Start from what the console already has loaded (the live fetch below refreshes it)
  const known = ctx.loans.find((l) => l.application_id === app.id);
  const [form, setForm] = useState<Form>(() => (known ? fromLoan(known) : { ...EMPTY, sanctioned_amount: String(app.requested_amount) }));
  const [saved, setSaved] = useState<Form | null>(() => (known ? fromLoan(known) : null)); // last saved loan (drives the EMI schedule)
  const [payments, setPayments] = useState<LoanPayment[]>(() =>
    ctx.payments
      .filter((p) => p.application_id === app.id)
      .map(({ instalment_no, paid_on, amount, reference }) => ({ instalment_no, paid_on, amount, reference }))
      .sort((a, b) => a.instalment_no - b.instalment_no),
  );
  const [docs, setDocs] = useState<LoanDocument[]>([]);

  // Demo mode: keep the console's Loans / Collections / Customers tabs in step with edits made here
  const { syncDemoLoan } = ctx;
  useEffect(() => {
    if (live || !saved) return;
    syncDemoLoan(app.id, toLoan(app.id, saved), payments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, saved, payments, app.id]);
  const [loading, setLoading] = useState(live);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!live) return;
    let alive = true;
    Promise.all([
      supabase!.from("loans").select("*").eq("application_id", app.id).maybeSingle(),
      supabase!.from("loan_payments").select("instalment_no,paid_on,amount,reference").eq("application_id", app.id).order("instalment_no"),
      supabase!.from("loan_documents").select("id,kind,title,uploaded_at,path").eq("application_id", app.id).order("uploaded_at", { ascending: false }),
    ]).then(([l, p, d]) => {
      if (!alive) return;
      if (l.data) {
        const f = fromLoan(l.data as Loan);
        setForm(f);
        setSaved(f);
      }
      setPayments((p.data as LoanPayment[]) ?? []);
      setDocs((d.data as LoanDocument[]) ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [app.id, live]);

  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-5">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Loan from partner bank</h3>
      </div>
      <div className="mt-3 flex gap-1 overflow-x-auto border-b hairline px-3 [scrollbar-width:none]" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setErr("");
            }}
            className={`relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-semibold transition ${tab === id ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            <Icon size={15} className={tab === id ? "text-gold" : ""} /> {label}
            {id === "docs" && docs.length > 0 && <span className="rounded-full bg-white/10 px-1.5 text-[0.65rem]">{docs.length}</span>}
            {tab === id && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-gold" />}
          </button>
        ))}
      </div>

      <div className="p-5">
        {err && (
          <div className="mb-4">
            <Notice tone="bad" onClose={() => setErr("")}>
              {err}
            </Notice>
          </div>
        )}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </p>
        ) : tab === "loan" ? (
          <LoanTab app={app} ctx={ctx} live={live} form={form} setForm={setForm} onSaved={setSaved} setErr={setErr} />
        ) : (
          <DocsTab app={app} ctx={ctx} live={live} docs={docs} setDocs={setDocs} setErr={setErr} />
        )}
      </div>
    </section>
  );
}

/* ================================================================ Loan */

function LoanTab({
  app,
  ctx,
  live,
  form,
  setForm,
  onSaved,
  setErr,
}: {
  app: Application;
  ctx: AdminCtx;
  live: boolean;
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  onSaved: (f: Form) => void;
  setErr: (s: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => v.replace(/\D/g, "");
  const dec = (v: string) => v.replace(/[^\d.]/g, "");

  async function save() {
    setErr("");
    if (!live) {
      onSaved(form);
      return ctx.toast("ok", "Demo: loan details saved for this session.");
    }
    setSaving(true);
    const { error } = await supabase!.rpc("admin_save_loan", { p_id: app.id, p: form });
    setSaving(false);
    if (error) return setErr(errorText(error));
    onSaved(form);
    ctx.toast("ok", `Loan details saved for ${app.full_name}.`);
  }

  return (
    <div className="space-y-6">
      <Group title="Loan">
        <F label="Loan account no." id="ln-acc">
          <input id="ln-acc" className="font-mono" maxLength={40} value={form.loan_account_no} onChange={(e) => set("loan_account_no", e.target.value)} placeholder="From the bank" />
        </F>
        <F label="Status" id="ln-status">
          <select id="ln-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="sanctioned">Sanctioned</option>
            <option value="disbursed">Disbursed</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </F>
        <F label="Sanctioned amount (₹)" id="ln-amt">
          <input id="ln-amt" inputMode="numeric" value={form.sanctioned_amount} onChange={(e) => set("sanctioned_amount", num(e.target.value))} />
        </F>
        <F label="Interest rate (% a year)" id="ln-rate">
          <input id="ln-rate" inputMode="decimal" value={form.interest_rate} onChange={(e) => set("interest_rate", dec(e.target.value))} placeholder="e.g. 14" />
        </F>
        <F label="Tenure (months)" id="ln-ten">
          <input id="ln-ten" inputMode="numeric" value={form.tenure_months} onChange={(e) => set("tenure_months", num(e.target.value))} placeholder="e.g. 12" />
        </F>
      </Group>

      <Group title="Disbursement">
        <F label="Disbursed on" id="ln-disb">
          <input id="ln-disb" type="date" value={form.disbursed_on} onChange={(e) => set("disbursed_on", e.target.value)} />
        </F>
        <F label="Amount credited (₹)" id="ln-damt">
          <input id="ln-damt" inputMode="numeric" value={form.disbursed_amount} onChange={(e) => set("disbursed_amount", num(e.target.value))} placeholder="After lender charges" />
        </F>
        <div className="sm:col-span-2">
          <F label="Credited to" id="ln-dto">
            <input id="ln-dto" maxLength={60} value={form.disbursed_to} onChange={(e) => set("disbursed_to", e.target.value)} placeholder="e.g. HDFC Bank ••4321 (last 4 digits only)" />
          </F>
        </div>
      </Group>

      <Group title="Charges (from the Key Fact Statement)">
        <F label="Lender processing fee (₹)" id="ln-pf">
          <input id="ln-pf" inputMode="numeric" value={form.processing_fee} onChange={(e) => set("processing_fee", num(e.target.value))} />
        </F>
        <F label="APR (%)" id="ln-apr">
          <input id="ln-apr" inputMode="decimal" value={form.apr} onChange={(e) => set("apr", dec(e.target.value))} placeholder="All-in yearly cost" />
        </F>
        <div className="sm:col-span-2">
          <F label="Late payment charges" id="ln-late">
            <input id="ln-late" maxLength={300} value={form.late_fee} onChange={(e) => set("late_fee", e.target.value)} placeholder="e.g. ₹500 per missed EMI" />
          </F>
        </div>
        <div className="sm:col-span-2">
          <F label="Prepayment / closure terms" id="ln-pre">
            <input id="ln-pre" maxLength={500} value={form.prepayment_terms} onChange={(e) => set("prepayment_terms", e.target.value)} placeholder="e.g. No charge after 6 EMIs" />
          </F>
        </div>
      </Group>

      <F label="Internal note (optional)" id="ln-note">
        <textarea id="ln-note" rows={2} maxLength={1000} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Sent to HDFC on 12 Nov, bank officer: Ravi" />
      </F>

      <button type="button" className="btn btn-dark" disabled={saving} onClick={() => void save()}>
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save loan details
      </button>
    </div>
  );
}

/* ================================================================ Documents */

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function DocsTab({
  app,
  ctx,
  live,
  docs,
  setDocs,
  setErr,
}: {
  app: Application;
  ctx: AdminCtx;
  live: boolean;
  docs: LoanDocument[];
  setDocs: React.Dispatch<React.SetStateAction<LoanDocument[]>>;
  setErr: (s: string) => void;
}) {
  const [kind, setKind] = useState<LoanDocumentKind>("kfs");
  const [title, setTitle] = useState(DOCUMENT_KINDS.kfs);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function upload() {
    setErr("");
    if (!file) return setErr("Choose a PDF or image to upload.");
    if (!EXT[file.type]) return setErr("Use a PDF, PNG, JPG or WebP file.");
    if (file.size > 10 * 1024 * 1024) return setErr("The file must be 10 MB or smaller.");
    if (title.trim().length < 2) return setErr("Give the document a name.");
    setBusy(true);
    try {
      let doc: LoanDocument;
      if (live) {
        const path = `${app.id}/${crypto.randomUUID()}.${EXT[file.type]}`;
        const up = await supabase!.storage.from("loan-documents").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        const { data, error } = await supabase!.rpc("admin_add_loan_document", { p_id: app.id, p_kind: kind, p_title: title.trim(), p_path: path });
        if (error) {
          await supabase!.storage.from("loan-documents").remove([path]);
          throw error;
        }
        doc = { id: data as string, kind, title: title.trim(), uploaded_at: new Date().toISOString(), path };
      } else {
        doc = { id: crypto.randomUUID(), kind, title: title.trim(), uploaded_at: new Date().toISOString() };
      }
      setDocs((d) => [doc, ...d]);
      setFile(null);
      setInputKey((k) => k + 1);
      ctx.toast("ok", `${doc.title} added${live ? "" : " (demo, not saved)"}. The borrower can download it from their Documents tab.`);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function view(d: LoanDocument) {
    if (!live || !d.path) return ctx.toast("bad", "Demo: files open once Supabase is connected.");
    const { data, error } = await supabase!.storage.from("loan-documents").createSignedUrl(d.path, 120);
    if (error) return setErr(errorText(error));
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(d: LoanDocument) {
    setErr("");
    if (live) {
      const { data, error } = await supabase!.rpc("admin_remove_loan_document", { p_doc: d.id });
      if (error) return setErr(errorText(error));
      await supabase!.storage.from("loan-documents").remove([data as string]);
    }
    setDocs((list) => list.filter((x) => x.id !== d.id));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border hairline bg-white/[0.02] p-4">
        <p className="text-sm font-semibold text-ink">Add a document</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <F label="Type" id="doc-kind">
            <select
              id="doc-kind"
              value={kind}
              onChange={(e) => {
                const k = e.target.value as LoanDocumentKind;
                setKind(k);
                setTitle(k === "other" ? "" : DOCUMENT_KINDS[k]);
              }}
            >
              {Object.entries(DOCUMENT_KINDS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </F>
          <F label="Name shown to borrower" id="doc-title">
            <input id="doc-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </F>
          <div className="sm:col-span-2">
            <F label="File (PDF or image, up to 10 MB)" id="doc-file">
              <input
                key={inputKey}
                id="doc-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink"
              />
            </F>
          </div>
        </div>
        <button type="button" className="btn btn-dark btn-sm mt-4" disabled={busy} onClick={() => void upload()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-muted">No documents yet. Upload the Key Fact Statement first; the RBI requires borrowers to receive it.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border hairline">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3.5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gold-soft text-gold">
                <FileText size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{d.title}</p>
                <p className="text-xs text-muted">
                  {DOCUMENT_KINDS[d.kind]} · {dateOnly(d.uploaded_at)}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void view(d)} title="Open">
                <ExternalLink size={14} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm text-bad" onClick={() => void remove(d)} title="Remove">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================================================================ Pieces */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-faint">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function F({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
