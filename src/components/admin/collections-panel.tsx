"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, MessageCircle, Phone, X } from "lucide-react";
import { appRef, dateOnly, daysBetween, rupees } from "@/lib/format";
import { formatPhone } from "@/lib/phone-auth";
import { downloadCsv } from "@/lib/csv";
import { REPAYMENT_METHODS } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";
import type { AdminCtx } from "./admin-console";
import { Empty, ExportButton, Pill, plural, Segmented, Stat } from "./kit";
import { dpdBucket, whatsappLink, type LoanRow } from "./portfolio";

type Window = "overdue" | "today" | "week" | "month";
type DueItem = { l: LoanRow; no: number; date: string; emi: number; late: number };

export function CollectionsPanel({ ctx }: { ctx: AdminCtx }) {
  const [win, setWin] = useState<Window>("overdue");
  const today = ctx.today;
  const open = ctx.loanRows.filter((l) => l.complete && l.loan.status !== "closed");

  // Every unpaid instalment that is late or due within 30 days
  const items = useMemo<DueItem[]>(() => {
    const out: DueItem[] = [];
    for (const l of open)
      for (const r of l.rows)
        if (r.status !== "paid") {
          const diff = daysBetween(today, r.date); // negative = late
          if (diff > 30) break;
          out.push({ l, no: r.no, date: r.date, emi: r.emi, late: Math.max(0, -diff) });
        }
    return out.sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.loanRows, today]);

  const inWin: Record<Window, (i: DueItem) => boolean> = {
    overdue: (i) => i.date < today,
    today: (i) => i.date === today,
    week: (i) => i.date >= today && daysBetween(today, i.date) <= 7,
    month: (i) => i.date >= today,
  };
  const rows = items.filter(inWin[win]);
  const sum = (w: Window) => items.filter(inWin[w]).reduce((s, i) => s + i.emi, 0);
  const count = (w: Window) => items.filter(inWin[w]).length;

  // This month: what fell due vs what was paid for those instalments
  const month = today.slice(0, 7);
  const dueThisMonth = open.flatMap((l) => l.rows.filter((r) => r.date.slice(0, 7) === month));
  const paidThisMonth = dueThisMonth.filter((r) => r.status === "paid");
  const efficiency = dueThisMonth.length ? Math.round((paidThisMonth.length / dueThisMonth.length) * 100) : null;
  const collectedThisMonth = ctx.payments.filter((p) => p.paid_on.slice(0, 7) === month).reduce((s, p) => s + p.amount, 0);

  // Ageing of the overdue book
  const buckets = [
    ["1–30", (d: number) => d >= 1 && d <= 30],
    ["31–60", (d: number) => d > 30 && d <= 60],
    ["61–90", (d: number) => d > 60 && d <= 90],
    ["90+", (d: number) => d > 90],
  ] as const;
  const ageing = buckets.map(([label, f]) => {
    const ls = open.filter((l) => f(l.dpd));
    return { label, loans: ls.length, amount: ls.reduce((s, l) => s + l.overdueAmount, 0) };
  });
  const ageingMax = Math.max(1, ...ageing.map((a) => a.amount));

  function exportCsv() {
    downloadCsv(
      `collections-${win}-${today}.csv`,
      ["Borrower", "Mobile", "Loan account no", "Reference", "EMI no", "Due date", "Amount", "Days late", "Repayment method"],
      rows.map((i) => [
        i.l.app.full_name,
        i.l.app.phone,
        i.l.loan.loan_account_no,
        appRef(i.l.app),
        i.no,
        i.date,
        i.emi,
        i.late,
        i.l.loan.repayment_method ? REPAYMENT_METHODS[i.l.loan.repayment_method] : "",
      ]),
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Overdue" value={rupees(sum("overdue"))} foot={`${plural(count("overdue"), "EMI")} late`} tone={count("overdue") ? "bad" : "ok"} onClick={() => setWin("overdue")} />
        <Stat label="Due today" value={rupees(sum("today"))} foot={plural(count("today"), "EMI")} tone="gold" onClick={() => setWin("today")} />
        <Stat label="Next 7 days" value={rupees(sum("week"))} foot={plural(count("week"), "EMI")} onClick={() => setWin("week")} />
        <Stat
          label="Collected this month"
          value={rupees(collectedThisMonth)}
          foot={efficiency == null ? "Nothing due this month" : `${efficiency}% of this month's EMIs paid`}
          tone="ok"
        />
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-lg">Overdue by age</h2>
          <p className="text-xs text-muted">Loans grouped by how late their oldest unpaid EMI is</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ageing.map((a) => (
            <div key={a.label} className="well p-3.5">
              <p className="text-xs font-semibold text-muted">{a.label} days</p>
              <p className={`mt-1 text-lg font-bold ${a.amount ? "text-bad" : ""}`}>{rupees(a.amount)}</p>
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <span className="block h-full rounded-full bg-bad" style={{ width: `${(a.amount / ageingMax) * 100}%` }} />
              </span>
              <p className="mt-1.5 text-[0.7rem] text-muted">
                {plural(a.loans, "loan")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Which EMIs"
          value={win}
          onChange={setWin}
          options={[
            ["overdue", "Overdue", count("overdue")],
            ["today", "Due today", count("today")],
            ["week", "Next 7 days", count("week")],
            ["month", "Next 30 days", count("month")],
          ]}
        />
        <ExportButton onClick={exportCsv} disabled={!rows.length} />
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty>
            {win === "overdue"
              ? "No overdue EMIs. Every borrower is on time."
              : open.length
                ? "No EMIs fall due in this window."
                : "No open loans with a complete EMI schedule yet. Add loan details from an approved application."}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((i) => (
              <DueRow key={`${i.l.app.id}-${i.no}`} i={i} ctx={ctx} />
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted">
        Record only payments you have confirmed with the lender. Reminders open WhatsApp with a message ready; nothing is sent until you tap Send.
      </p>
    </div>
  );
}

function DueRow({ i, ctx }: { i: DueItem; ctx: AdminCtx }) {
  const { site } = useSettings();
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(ctx.today);
  const [amount, setAmount] = useState(String(i.emi));
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { l } = i;
  const b = dpdBucket(i.late);

  const howToPay = l.loan.repayment_link
    ? ` You can pay here: ${l.loan.repayment_link}`
    : l.loan.repayment_method === "auto_debit"
      ? " Please keep enough balance in your account for the auto-debit."
      : "";
  const message =
    `Hello ${l.app.full_name.split(" ")[0]}, this is ${site?.company_name ?? "Money Pay"}. ` +
    (i.late
      ? `Your EMI ${i.no} of ${rupees(i.emi)} for loan ${l.loan.loan_account_no || appRef(l.app)} with ${l.app.lender_name ?? site?.lender_name ?? "the lender"} was due on ${dateOnly(i.date)} and is now ${i.late} day${i.late === 1 ? "" : "s"} overdue. Please pay it as soon as possible to avoid late charges.`
      : `A reminder that your EMI ${i.no} of ${rupees(i.emi)} for loan ${l.loan.loan_account_no || appRef(l.app)} is due on ${dateOnly(i.date)}.`) +
    howToPay +
    " If you have already paid, please ignore this message.";

  async function save() {
    setErr("");
    const amt = Number(amount);
    if (!(amt > 0)) return setErr("Enter the amount paid.");
    if (!paidOn || paidOn > ctx.today) return setErr("Enter the date it was paid (not in the future).");
    setBusy(true);
    const e = await ctx.recordPayment(l.app.id, { instalment_no: i.no, paid_on: paidOn, amount: amt, reference: ref.trim() });
    setBusy(false);
    if (e) return setErr(e);
    ctx.toast("ok", `${ctx.demo ? "Demo: " : ""}EMI ${i.no} marked paid for ${l.app.full_name}.`);
    setOpen(false);
  }

  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <button type="button" className="text-left font-semibold hover:underline" onClick={() => ctx.openCustomer(l.app.user_id)}>
            {l.app.full_name}
          </button>
          <p className="truncate text-xs text-muted">
            {formatPhone(l.app.phone)} · <span className="font-mono">{l.loan.loan_account_no || appRef(l.app)}</span> · EMI {i.no} of {l.total}
          </p>
        </div>
        <div className="flex items-center gap-3 md:w-64 md:justify-end">
          <div className="text-left md:text-right">
            <p className="font-semibold tabular-nums">{rupees(i.emi)}</p>
            <p className={`text-xs ${i.late ? "font-semibold text-bad" : "text-muted"}`}>
              {i.late ? `${i.late} d late · ${dateOnly(i.date)}` : i.date === ctx.today ? "Due today" : `Due ${dateOnly(i.date)}`}
            </p>
          </div>
          {i.late > 0 && <Pill tone={b.tone}>{b.label.replace(" late", "")}</Pill>}
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <a className="btn btn-ghost btn-sm" href={`tel:+91${l.app.phone}`} aria-label={`Call ${l.app.full_name}`} title="Call">
            <Phone size={15} />
          </a>
          <a className="btn btn-outline btn-sm" href={whatsappLink(l.app.phone, message)} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={14} /> Remind
          </a>
          <button type="button" className="btn btn-dark btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <X size={14} /> : <Check size={14} />} {open ? "Cancel" : "Mark paid"}
          </button>
        </div>
      </div>

      {open && (
        <div className="well mt-3 p-3.5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr_auto] sm:items-end">
            <label className="block text-xs font-semibold text-muted">
              Paid on
              <input type="date" className="mt-1" max={ctx.today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-muted">
              Amount (₹)
              <input className="mt-1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
            </label>
            <label className="block text-xs font-semibold text-muted">
              Reference (UTR / NACH)
              <input className="mt-1 font-mono" maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" />
            </label>
            <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
            </button>
          </div>
          {err && <p className="mt-2 text-xs font-semibold text-bad">{err}</p>}
        </div>
      )}
    </li>
  );
}
