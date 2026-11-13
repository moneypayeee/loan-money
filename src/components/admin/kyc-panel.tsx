"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageOff,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { appRef, dateOnly, dateTime, errorText, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone-auth";
import type { Application, ApplicationEvent, Kyc, KycDocKey, KycStatus } from "@/lib/types";
import { Notice } from "../ui";
import type { AdminCtx } from "./admin-console";
import { DEMO_KYC } from "./demo-data";
import { Empty, initials, Pill, Segmented, Stat } from "./kit";
import { ageOn, docKeys, docLabel, docList, loadKyc, type KycDoc } from "./kyc-docs";

type Filter = "to_verify" | "waiting" | "problem" | "verified";

export const KYC_STATUS: Record<KycStatus, { label: string; tone: "warn" | "ok" | "bad" | "gold" }> = {
  pending: { label: "To verify", tone: "warn" },
  verified: { label: "KYC verified", tone: "ok" },
  problem: { label: "KYC problem", tone: "bad" },
  resubmit: { label: "New document requested", tone: "gold" },
};

const QUEUE: Record<Filter, (a: Application) => boolean> = {
  to_verify: (a) => a.kyc_status === "pending",
  waiting: (a) => a.kyc_status === "resubmit",
  problem: (a) => a.kyc_status === "problem",
  verified: (a) => a.kyc_status === "verified",
};

export function KycPanel({ ctx, selected, select }: { ctx: AdminCtx; selected: string | null; select: (id: string | null) => void }) {
  const [filter, setFilter] = useState<Filter>("to_verify");
  // Only applications still under review are worked on here
  const open = useMemo(() => ctx.apps.filter((a) => a.status === "pending").sort((x, y) => x.created_at.localeCompare(y.created_at)), [ctx.apps]);
  const list = open.filter(QUEUE[filter]);
  const current = selected ? ctx.apps.find((a) => a.id === selected) ?? null : null;

  const verifiedToday = ctx.apps.filter((a) => a.kyc_status === "verified" && a.kyc_reviewed_at?.slice(0, 10) === ctx.today).length;

  /** After a decision, move on to the next application waiting in the same queue. */
  function next(afterId: string) {
    const rest = open.filter((a) => a.id !== afterId && QUEUE.to_verify(a));
    select(rest[0]?.id ?? null);
    if (!rest.length) setFilter("to_verify");
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="To verify" value={String(open.filter(QUEUE.to_verify).length)} foot="Oldest first" tone={open.some(QUEUE.to_verify) ? "warn" : "ok"} onClick={() => setFilter("to_verify")} />
        <Stat label="Waiting on applicant" value={String(open.filter(QUEUE.waiting).length)} foot="New document requested" tone="gold" onClick={() => setFilter("waiting")} />
        <Stat label="Problems" value={String(open.filter(QUEUE.problem).length)} foot="Ready to decline" tone={open.some(QUEUE.problem) ? "bad" : "default"} onClick={() => setFilter("problem")} />
        <Stat label="Verified today" value={String(verifiedToday)} foot={`${open.filter(QUEUE.verified).length} ready for a decision`} tone="ok" onClick={() => setFilter("verified")} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        {/* Queue: always on desktop, only when nothing is open on smaller screens */}
        <div className={`space-y-3 ${current ? "hidden xl:block" : ""}`}>
          <Segmented
            label="KYC queue"
            grid
            value={filter}
            onChange={(f) => setFilter(f)}
            options={[
              ["to_verify", "To verify", open.filter(QUEUE.to_verify).length],
              ["waiting", "Waiting", open.filter(QUEUE.waiting).length],
              ["problem", "Problems", open.filter(QUEUE.problem).length],
              ["verified", "Verified", open.filter(QUEUE.verified).length],
            ]}
          />
          <div className="card overflow-hidden">
            {list.length === 0 ? (
              <Empty>
                {filter === "to_verify" ? (
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-ok" /> All documents are checked.
                  </span>
                ) : (
                  "Nothing here."
                )}
              </Empty>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((a) => (
                  <QueueItem key={a.id} a={a} on={a.id === current?.id} onClick={() => select(a.id)} />
                ))}
              </ul>
            )}
          </div>
        </div>

        {current ? (
          <Review key={current.id} a={current} ctx={ctx} back={() => select(null)} done={() => next(current.id)} />
        ) : (
          <div className="card hidden place-items-center p-12 text-center xl:grid">
            <div>
              <ShieldCheck size={28} className="mx-auto text-gold" />
              <p className="mt-3 font-semibold">Choose an application to check its documents</p>
              <p className="mt-1 text-sm text-muted">The oldest applications are at the top of the list.</p>
              {list[0] && (
                <button type="button" className="btn btn-dark btn-sm mt-5" onClick={() => select(list[0].id)}>
                  Start with {list[0].full_name.split(" ")[0]} <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueItem({ a, on, onClick }: { a: Application; on: boolean; onClick: () => void }) {
  const late = Date.now() - new Date(a.created_at).getTime() > 48 * 3600e3;
  const reuploaded = a.kyc_status === "pending" && a.kyc_reviewed_at;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={on ? "true" : undefined}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${on ? "bg-gold/[0.08] shadow-[inset_2px_0_0_var(--color-gold)]" : "hover:bg-white/[0.03]"}`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-xs font-bold text-ink-2">{initials(a.full_name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{a.full_name}</span>
          <span className="block truncate text-xs text-muted">
            {a.category} · <span className={late ? "font-semibold text-bad" : ""}>{timeAgo(a.created_at)}</span>
          </span>
        </span>
        {reuploaded ? <Pill tone="info">Re-uploaded</Pill> : <ChevronRight size={15} className="shrink-0 text-faint" />}
      </button>
    </li>
  );
}

/* ================================================================ Review */

type Action = "verified" | "resubmit" | "problem";
const REASONS = [
  "The photo is blurred or hard to read.",
  "Part of the document is cut off. Please show all four corners.",
  "The address proof is older than 3 months.",
  "The name doesn't match the name on your application.",
  "The document has expired.",
];

function Review({ a, ctx, back, done }: { a: Application; ctx: AdminCtx; back: () => void; done: () => void }) {
  const [kyc, setKyc] = useState<Kyc | null | undefined>(undefined);
  const [docs, setDocs] = useState<KycDoc[]>([]);
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [action, setAction] = useState<Action>("verified");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [askDocs, setAskDocs] = useState<KycDocKey[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const decidedHere = a.status !== "pending";

  async function load() {
    setErr("");
    if (ctx.demo || !supabase) {
      const k = { ...DEMO_KYC, institution: a.category === "Student" ? "St. Xavier's College, Mumbai" : null, identity_type: a.category === "Driver" ? "Driving licence" : "Voter ID" };
      setKyc(k);
      setDocs(docList(a, k));
      return;
    }
    setLoading(true);
    try {
      const [r, ev] = await Promise.all([
        loadKyc(a),
        supabase.from("application_events").select("id,application_id,kind,note,created_at").eq("application_id", a.id).like("kind", "kyc_%").order("created_at"),
      ]);
      setKyc(r.kyc);
      setDocs(r.docs);
      setEvents((ev.data ?? []) as ApplicationEvent[]);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id, a.kyc_status]);

  const age = kyc ? ageOn(kyc.dob, ctx.today) : null;
  const checklist: [string, React.ReactNode][] = kyc
    ? [
        ["name", <>Name on the ID matches <strong>{a.full_name}</strong></>],
        ["dob", <>Date of birth on the ID is <strong>{dateOnly(kyc.dob + "T00:00:00")}</strong>{age != null && <> (age {age})</>}</>],
        ["id", <>{kyc.identity_type} number ends in <strong className="font-mono">{kyc.identity_last4}</strong></>],
        ["address", <>Address proof shows <strong>{kyc.city}, {kyc.pincode}</strong> and is less than 3 months old</>],
        ...(a.category === "Student" ? ([["student", <>Student ID is from <strong>{kyc.institution}</strong> and still valid</>]] as [string, React.ReactNode][]) : []),
        ["clear", "Every document is clear, complete and not edited"],
      ]
    : [];
  const allChecked = checklist.length > 0 && checklist.every(([k]) => checks[k]);

  async function submit() {
    setErr("");
    const n = note.trim();
    if (action === "verified" && !allChecked) return setErr("Tick every check first.");
    if (action === "resubmit" && !askDocs.length) return setErr("Choose which document the applicant should upload again.");
    if (action !== "verified" && n.length < 3) return setErr(action === "resubmit" ? "Tell the applicant what is wrong." : "Describe the problem.");

    if (ctx.demo) {
      ctx.patch(a.id, { kyc_status: action, kyc_verified: action === "verified", kyc_note: action === "verified" ? "" : n, kyc_requested_docs: action === "resubmit" ? askDocs : [], kyc_reviewed_at: new Date().toISOString() });
      finish();
      return;
    }
    setBusy(true);
    const { error } = await supabase!.rpc("admin_review_kyc", { p_id: a.id, p_decision: action, p_note: n, p_docs: action === "resubmit" ? askDocs : [] });
    setBusy(false);
    if (error) return setErr(errorText(error));
    await ctx.reload();
    finish();
  }

  function finish() {
    const who = a.full_name;
    ctx.toast(
      "ok",
      (ctx.demo ? "Demo: " : "") +
        (action === "verified"
          ? `${who}'s KYC verified. The application is ready for a decision in Applications.`
          : action === "resubmit"
            ? `Asked ${who} to upload ${askDocs.map((d) => docLabel(d, kyc?.identity_type).toLowerCase()).join(" and ")} again.`
            : `KYC problem recorded for ${who}. Decline the application in Applications with a reason.`),
    );
    if (action === "problem") ctx.open(a.id);
    else done();
  }

  return (
    <div className="min-w-0 space-y-4">
      <button type="button" className="btn btn-ghost btn-sm -ml-2 xl:hidden" onClick={back}>
        <ArrowLeft size={15} /> KYC queue
      </button>

      {/* Header */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="display truncate text-2xl">{a.full_name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {formatPhone(a.phone)} · {a.category} · <span className="font-mono text-xs">{appRef(a)}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone={KYC_STATUS[a.kyc_status].tone}>{KYC_STATUS[a.kyc_status].label}</Pill>
              <Pill tone="muted">Applied {timeAgo(a.created_at)}</Pill>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {!ctx.demo && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading} title="Refresh document links">
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => ctx.open(a.id)}>
              Open application <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {a.kyc_status === "resubmit" && (
          <div className="mt-4">
            <Notice tone="warn">
              Waiting for {a.full_name.split(" ")[0]} to upload: <strong>{a.kyc_requested_docs.map((d) => docLabel(d, kyc?.identity_type)).join(", ")}</strong>.
              <span className="mt-1 block text-xs">Your message: &ldquo;{a.kyc_note}&rdquo;</span>
            </Notice>
          </div>
        )}
        {a.kyc_status === "problem" && (
          <div className="mt-4">
            <Notice tone="bad">
              Problem found: {a.kyc_note}
              <button type="button" className="mt-1 block text-xs font-semibold underline" onClick={() => ctx.open(a.id)}>
                Decline the application
              </button>
            </Notice>
          </div>
        )}
        {a.kyc_status === "verified" && (
          <div className="mt-4">
            <Notice tone="ok">
              Verified {a.kyc_reviewed_at ? timeAgo(a.kyc_reviewed_at) : ""}. Next: check the payment and approve in the application.
            </Notice>
          </div>
        )}
      </section>

      {err && (
        <Notice tone="bad" onClose={() => setErr("")}>
          {err}
        </Notice>
      )}

      {kyc === undefined || loading ? (
        <p className="flex items-center gap-2 p-4 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Loading documents…
        </p>
      ) : kyc === null ? (
        <Notice tone="warn">This application has no KYC documents, so it can&rsquo;t be verified. Decline it with a reason.</Notice>
      ) : (
        <>
          {/* Details */}
          <section className="card p-5 sm:p-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">What the applicant told us</h3>
            <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <D k="Name" v={a.full_name} />
              <D k="Date of birth" v={`${dateOnly(kyc.dob + "T00:00:00")}${age != null ? ` · ${age} years` : ""}`} warn={age != null && age < 18 ? "Under 18" : undefined} />
              <D k="ID" v={`${kyc.identity_type} ···· ${kyc.identity_last4}`} mono />
              <div className="sm:col-span-2 xl:col-span-3">
                <D k="Address" v={`${kyc.address}, ${kyc.city}, ${kyc.state} ${kyc.pincode}`} />
              </div>
              {kyc.institution && <D k="Institution" v={kyc.institution} />}
              <D k="Consent given" v={dateTime(kyc.consent_at)} />
            </dl>
          </section>

          {/* Documents */}
          <section className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Documents</h3>
              {!ctx.demo && <p className="text-xs text-faint">Links expire after 5 minutes. Use refresh if one stops opening.</p>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {docs
                .filter((d) => d.path || d.key !== "identity_back")
                .map((d) => (
                  <DocCard key={d.key} d={d} demo={ctx.demo} requested={a.kyc_status === "resubmit" && a.kyc_requested_docs.includes(d.key)} />
                ))}
            </div>
          </section>

          {/* Decide */}
          {!decidedHere && a.kyc_status !== "resubmit" && (
            <section className="card p-5 sm:p-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Your result</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Choice on={action === "verified"} onClick={() => setAction("verified")} tone="ok" title="Verified" sub="Everything matches" />
                <Choice on={action === "resubmit"} onClick={() => setAction("resubmit")} tone="gold" title="Ask for new document" sub="Applicant uploads again" />
                <Choice on={action === "problem"} onClick={() => setAction("problem")} tone="bad" title="Problem found" sub="Can't be fixed by re-upload" />
              </div>

              {action === "verified" && (
                <fieldset className="mt-5">
                  <legend className="text-sm font-semibold">Check each one against the documents</legend>
                  <ul className="mt-3 space-y-2">
                    {checklist.map(([k, label]) => (
                      <li key={k}>
                        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${checks[k] ? "border-ok/30 bg-ok-soft/50" : "hairline bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                          <input type="checkbox" className="mt-0.5" checked={!!checks[k]} onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))} />
                          <span>{label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}

              {action === "resubmit" && (
                <div className="mt-5 space-y-4">
                  <fieldset>
                    <legend className="text-sm font-semibold">Which document should they upload again?</legend>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {docKeys(a.category).map((k) => (
                        <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${askDocs.includes(k) ? "border-gold/40 bg-gold-soft" : "hairline bg-white/[0.02]"}`}>
                          <input
                            type="checkbox"
                            checked={askDocs.includes(k)}
                            onChange={(e) => setAskDocs((l) => (e.target.checked ? [...l, k] : l.filter((x) => x !== k)))}
                          />
                          {docLabel(k, kyc.identity_type)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <NoteBox note={note} setNote={setNote} label="Message to the applicant" hint="They see this on their application page." reasons={REASONS} />
                </div>
              )}

              {action === "problem" && (
                <div className="mt-5">
                  <NoteBox
                    note={note}
                    setNote={setNote}
                    label="What is the problem?"
                    hint="For example a fake or edited document, or the person is under 18. After saving, decline the application with a reason."
                    reasons={["The documents appear to be edited.", "The applicant is under 18.", "The ID belongs to someone else."]}
                  />
                </div>
              )}

              <button
                type="button"
                className={`btn mt-5 w-full sm:w-auto ${action === "verified" ? "btn-ok" : action === "problem" ? "btn-bad" : "btn-dark"}`}
                disabled={busy || (action === "verified" && !allChecked)}
                onClick={() => void submit()}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : action === "verified" ? <Check size={15} /> : action === "resubmit" ? <Upload size={15} /> : <AlertTriangle size={15} />}
                {action === "verified" ? "Mark KYC verified" : action === "resubmit" ? "Send request to applicant" : "Record problem"}
              </button>
              {action === "verified" && !allChecked && <p className="mt-2 text-xs text-muted">Tick all {checklist.length} checks to continue.</p>}
            </section>
          )}

          {/* History */}
          {events.length > 0 && (
            <section className="card p-5 sm:p-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">KYC history</h3>
              <ul className="mt-3 space-y-2.5 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted">{dateTime(e.created_at)}</span>
                    <span>
                      <strong>{HISTORY[e.kind] ?? e.kind}</strong>
                      {e.note && <span className="text-ink-2"> · {e.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const HISTORY: Record<string, string> = {
  kyc_verified: "Verified",
  kyc_problem: "Problem found",
  kyc_resubmit: "New document requested",
  kyc_resubmitted: "Applicant uploaded a new document",
};

function D({ k, v, mono = false, warn }: { k: string; v: string; mono?: boolean; warn?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className={`mt-0.5 break-words font-semibold ${mono ? "font-mono text-[0.85rem]" : ""}`}>
        {v} {warn && <span className="ml-1 text-xs font-bold text-bad">{warn}</span>}
      </dd>
    </div>
  );
}

function DocCard({ d, demo, requested }: { d: KycDoc; demo: boolean; requested: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <figure className={`overflow-hidden rounded-xl border bg-white/[0.02] ${requested ? "border-gold/50" : "hairline"}`}>
      <div className="grid h-48 place-items-center bg-black/30">
        {demo ? (
          <span className="flex flex-col items-center gap-2 text-xs text-muted">
            <FileText size={22} /> Sample. Real files show here when live.
          </span>
        ) : !d.path ? (
          <span className="text-xs text-bad">Not uploaded</span>
        ) : d.pdf ? (
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 text-sm font-semibold text-brand hover:underline">
            <FileText size={26} /> Open PDF
          </a>
        ) : broken || !d.url ? (
          <span className="flex flex-col items-center gap-2 text-xs text-muted">
            <ImageOff size={22} /> Link expired. Refresh.
          </span>
        ) : (
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="block size-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.url} alt={d.label} className="size-full object-contain" onError={() => setBroken(true)} />
          </a>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 border-t hairline px-3 py-2.5 text-sm">
        <span className="truncate font-semibold">{d.label}</span>
        {requested ? (
          <Pill tone="gold">Requested again</Pill>
        ) : (
          d.url && (
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
              Full size <ExternalLink size={12} />
            </a>
          )
        )}
      </figcaption>
    </figure>
  );
}

function Choice({ on, onClick, tone, title, sub }: { on: boolean; onClick: () => void; tone: "ok" | "gold" | "bad"; title: string; sub: string }) {
  const ring = { ok: "border-ok/50 bg-ok-soft", gold: "border-gold/50 bg-gold-soft", bad: "border-bad/50 bg-bad-soft" }[tone];
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-xl border p-3.5 text-left transition ${on ? ring : "hairline bg-white/[0.02] hover:bg-white/[0.04]"}`}>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs text-muted">{sub}</span>
    </button>
  );
}

function NoteBox({ note, setNote, label, hint, reasons }: { note: string; setNote: (s: string) => void; label: string; hint: string; reasons: string[] }) {
  return (
    <div>
      <label className="text-sm font-semibold" htmlFor="kyc-note">
        {label}
      </label>
      <p className="text-xs text-muted">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-ink-2 transition hover:border-gold/40 hover:text-ink"
            onClick={() => setNote(note.trim() ? `${note.trim()} ${r}` : r)}
          >
            + {r.replace(/\.$/, "")}
          </button>
        ))}
      </div>
      <textarea id="kyc-note" className="mt-2" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
    </div>
  );
}

