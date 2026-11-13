"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, FileUp, IndianRupee, KeyRound, Landmark, Loader2, RotateCcw, ScanFace, Send, Trash2, Upload, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { appRef, dateTime, errorText, timeAgo } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import type { ActivityEntry } from "@/lib/types";
import type { AdminCtx } from "./admin-console";
import { Empty, ExportButton, SearchBox, Segmented } from "./kit";
import { demoActivity } from "./demo-data";

const PAGE = 200;

const KIND: Record<string, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  submitted: { label: "Application submitted", icon: Send, cls: "text-brand bg-brand-soft" },
  accepted: { label: "Approved", icon: CheckCircle2, cls: "text-ok bg-ok-soft" },
  rejected: { label: "Declined", icon: XCircle, cls: "text-bad bg-bad-soft" },
  refund_due: { label: "Refund queued", icon: RotateCcw, cls: "text-gold bg-gold-soft" },
  no_refund: { label: "No refund", icon: XCircle, cls: "text-muted bg-white/[0.05]" },
  refunded: { label: "Refund sent", icon: RotateCcw, cls: "text-ok bg-ok-soft" },
  loan_updated: { label: "Loan updated", icon: Landmark, cls: "text-brand bg-brand-soft" },
  access_issued: { label: "Borrower login issued", icon: KeyRound, cls: "text-gold bg-gold-soft" },
  payment_recorded: { label: "EMI recorded", icon: IndianRupee, cls: "text-ok bg-ok-soft" },
  payment_removed: { label: "EMI removed", icon: Trash2, cls: "text-bad bg-bad-soft" },
  document_added: { label: "Document added", icon: FileUp, cls: "text-brand bg-brand-soft" },
  document_removed: { label: "Document removed", icon: Trash2, cls: "text-bad bg-bad-soft" },
  kyc_verified: { label: "KYC verified", icon: ScanFace, cls: "text-ok bg-ok-soft" },
  kyc_problem: { label: "KYC problem", icon: ScanFace, cls: "text-bad bg-bad-soft" },
  kyc_resubmit: { label: "New document requested", icon: Upload, cls: "text-gold bg-gold-soft" },
  kyc_resubmitted: { label: "New document uploaded", icon: Upload, cls: "text-brand bg-brand-soft" },
};
const kindOf = (k: string) => KIND[k] ?? { label: k, icon: FileText, cls: "text-muted bg-white/[0.05]" };

type Group = "all" | "decisions" | "money" | "loans" | "applicants";
const GROUPS: Record<Group, (e: ActivityEntry) => boolean> = {
  all: () => true,
  decisions: (e) => ["accepted", "rejected", "kyc_verified", "kyc_problem", "kyc_resubmit"].includes(e.kind),
  money: (e) => ["refund_due", "no_refund", "refunded", "payment_recorded", "payment_removed"].includes(e.kind),
  loans: (e) => ["loan_updated", "access_issued", "document_added", "document_removed"].includes(e.kind),
  applicants: (e) => e.actor === "applicant",
};

export function ActivityPanel({ ctx }: { ctx: AdminCtx }) {
  const [items, setItems] = useState<ActivityEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const [group, setGroup] = useState<Group>("all");
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");

  const fetchPage = useCallback(async (before: string | null) => {
    const { data, error } = await supabase!.rpc("admin_activity", { p_limit: PAGE, p_before: before });
    if (error) throw error;
    return (data ?? []) as ActivityEntry[];
  }, []);

  useEffect(() => {
    if (ctx.demo || !supabase) {
      setItems(demoActivity(ctx.apps));
      return;
    }
    let alive = true;
    fetchPage(null)
      .then((d) => {
        if (!alive) return;
        setItems(d);
        setMore(d.length === PAGE);
      })
      .catch((e) => alive && (setErr(errorText(e)), setItems([])));
    return () => {
      alive = false;
    };
  }, [ctx.demo, ctx.apps, fetchPage]);

  async function loadMore() {
    if (!items?.length) return;
    setLoadingMore(true);
    try {
      const d = await fetchPage(items.at(-1)!.created_at);
      setItems([...items, ...d.filter((x) => !items.some((y) => y.id === x.id))]);
      setMore(d.length === PAGE);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const admins = useMemo(() => [...new Set((items ?? []).filter((e) => e.actor === "admin").map((e) => e.actor_label))].sort(), [items]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? [])
      .filter(GROUPS[group])
      .filter((e) => !who || e.actor_label === who)
      .filter((e) => !needle || [e.full_name, e.note, e.ref_code ?? "", kindOf(e.kind).label].some((s) => s.toLowerCase().includes(needle)));
  }, [items, group, who, q]);

  // Group by day for readability
  const days = useMemo(() => {
    const out: { day: string; list: ActivityEntry[] }[] = [];
    for (const e of rows) {
      const day = new Date(e.created_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      if (out.at(-1)?.day === day) out.at(-1)!.list.push(e);
      else out.push({ day, list: [e] });
    }
    return out;
  }, [rows]);

  function exportCsv() {
    downloadCsv(
      `activity-${ctx.today}.csv`,
      ["When", "What", "Applicant", "Reference", "By", "Details"],
      rows.map((e) => [e.created_at, kindOf(e.kind).label, e.full_name, e.ref_code ?? "", e.actor_label, e.note]),
    );
  }

  if (!items)
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading activity…
      </p>
    );

  return (
    <div className="space-y-5">
      {err && <p className="rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Segmented
          label="Filter activity"
          value={group}
          onChange={setGroup}
          options={[
            ["all", "All"],
            ["decisions", "Decisions"],
            ["money", "Money"],
            ["loans", "Loans"],
            ["applicants", "By applicants"],
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className="sm:!w-56" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Done by">
            <option value="">Anyone</option>
            {admins.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <SearchBox value={q} onChange={setQ} placeholder="Name, MP- or note" />
          <ExportButton onClick={exportCsv} disabled={!rows.length} label="CSV" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty>No activity matches.</Empty>
        ) : (
          days.map(({ day, list }) => (
            <section key={day}>
              <h3 className="border-b hairline bg-white/[0.03] px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] text-muted sm:px-6">{day}</h3>
              <ul className="divide-y divide-line">
                {list.map((e) => {
                  const k = kindOf(e.kind);
                  const Icon = k.icon;
                  return (
                    <li key={e.id}>
                      <button type="button" onClick={() => ctx.open(e.application_id)} className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-white/[0.03] sm:px-6">
                        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${k.cls}`}>
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">
                            <strong>{k.label}</strong> · {e.full_name} <span className="font-mono text-xs text-muted">{e.ref_code ?? appRef({ ref_code: null, id: e.application_id })}</span>
                          </span>
                          {e.note && e.note !== k.label && <span className="mt-0.5 block truncate text-xs text-ink-2">{e.note}</span>}
                          <span className="mt-0.5 block text-xs text-muted">
                            {e.actor === "admin" ? `by ${e.actor_label}` : e.actor === "applicant" ? "by the applicant" : "automatic"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-muted" title={dateTime(e.created_at)}>
                          {timeAgo(e.created_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
      {more && (
        <div className="text-center">
          <button type="button" className="btn btn-outline btn-sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore && <Loader2 size={14} className="animate-spin" />} Load older activity
          </button>
        </div>
      )}
    </div>
  );
}
