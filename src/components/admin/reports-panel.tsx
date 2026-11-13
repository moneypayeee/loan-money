"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { appRef, rupees, rupeesShort } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { CATEGORIES } from "@/lib/types";
import type { AdminCtx } from "./admin-console";
import { plural, Stat } from "./kit";

type Preset = "this_month" | "last_month" | "3m" | "fy" | "all" | "custom";

/** Calendar date (YYYY-MM-DD) of an ISO timestamp, in India. */
const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

function range(p: Preset, today: string, from: string, to: string): [string, string] {
  const [y, m] = today.split("-").map(Number);
  switch (p) {
    case "this_month":
      return [ymd(y, m, 1), today];
    case "last_month":
      return [ymd(y, m - 1, 1), ymd(y, m, 0)];
    case "3m":
      return [ymd(y, m - 2, 1), today];
    case "fy": {
      const start = m >= 4 ? y : y - 1; // Indian financial year: 1 April – 31 March
      return [ymd(start, 4, 1), today];
    }
    case "all":
      return ["2000-01-01", today];
    default:
      return [from || today, to || today];
  }
}

const monthLabel = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });

export function ReportsPanel({ ctx }: { ctx: AdminCtx }) {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [from, setFrom] = useState(ctx.today.slice(0, 8) + "01");
  const [to, setTo] = useState(ctx.today);
  const [start, end] = range(preset, ctx.today, from, to);
  const inR = (d: string | null | undefined) => Boolean(d) && d! >= start && d! <= end;

  const r = useMemo(() => {
    const apps = ctx.apps.filter((a) => inR(istDay(a.created_at)));
    const decided = ctx.apps.filter((a) => a.reviewed_at && inR(istDay(a.reviewed_at)));
    const approved = decided.filter((a) => a.status === "accepted");
    const declined = decided.filter((a) => a.status === "rejected");
    const feesIn = decided.filter((a) => a.payment_verified);
    const refunds = ctx.apps.filter((a) => a.refunded_at && inR(istDay(a.refunded_at)));
    const disbursed = ctx.loanRows.filter((l) => inR(l.loan.disbursed_on));
    const emis = ctx.payments.filter((p) => inR(p.paid_on));
    const reviewHours = decided.map((a) => (Date.parse(a.reviewed_at!) - Date.parse(a.created_at)) / 36e5);

    // Month-by-month breakdown
    const months = new Map<string, { apps: number; approved: number; declined: number; fees: number; refunds: number; disbursed: number; emis: number }>();
    const bump = (d: string, k: keyof ReturnType<typeof empty>, v = 1) => {
      const key = d.slice(0, 7);
      const row = months.get(key) ?? empty();
      row[k] += v;
      months.set(key, row);
    };
    function empty() {
      return { apps: 0, approved: 0, declined: 0, fees: 0, refunds: 0, disbursed: 0, emis: 0 };
    }
    apps.forEach((a) => bump(istDay(a.created_at), "apps"));
    approved.forEach((a) => bump(istDay(a.reviewed_at!), "approved"));
    declined.forEach((a) => bump(istDay(a.reviewed_at!), "declined"));
    feesIn.forEach((a) => bump(istDay(a.reviewed_at!), "fees", a.fee));
    refunds.forEach((a) => bump(istDay(a.refunded_at!), "refunds", a.fee));
    disbursed.forEach((l) => bump(l.loan.disbursed_on!, "disbursed", l.loan.disbursed_amount ?? l.loan.sanctioned_amount ?? 0));
    emis.forEach((p) => bump(p.paid_on, "emis", p.amount));

    const byCat = CATEGORIES.map((c) => {
      const d = decided.filter((a) => a.category === c);
      const ok = d.filter((a) => a.status === "accepted").length;
      return { c, apps: apps.filter((a) => a.category === c).length, decided: d.length, rate: d.length ? Math.round((ok / d.length) * 100) : null };
    });

    return {
      apps,
      decided,
      approved,
      declined,
      feesIn,
      refunds,
      disbursed,
      emis,
      avgReview: reviewHours.length ? Math.round((reviewHours.reduce((s, h) => s + h, 0) / reviewHours.length) * 10) / 10 : null,
      months: [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      byCat,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.apps, ctx.loanRows, ctx.payments, start, end]);

  const feeTotal = r.feesIn.reduce((s, a) => s + a.fee, 0);
  const refundTotal = r.refunds.reduce((s, a) => s + a.fee, 0);
  const disbTotal = r.disbursed.reduce((s, l) => s + (l.loan.disbursed_amount ?? l.loan.sanctioned_amount ?? 0), 0);
  const emiTotal = r.emis.reduce((s, p) => s + p.amount, 0);
  const approvalRate = r.decided.length ? Math.round((r.approved.length / r.decided.length) * 100) : null;
  const tag = `${start}_to_${end}`;
  const names = new Map(ctx.apps.map((a) => [a.id, a]));

  const exports: { label: string; note: string; run: () => void; n: number }[] = [
    {
      label: "Applications",
      note: "Submitted in this period",
      n: r.apps.length,
      run: () =>
        downloadCsv(
          `applications-${tag}.csv`,
          ["Submitted", "Reference", "Name", "Mobile", "Email", "Category", "Requested", "UTR", "Status", "Payment confirmed", "KYC checked", "Decided at", "Note to applicant"],
          r.apps.map((a) => [a.created_at, appRef(a), a.full_name, a.phone, a.contact_email ?? "", a.category, a.requested_amount, a.transaction_id, a.status, a.payment_verified ? "Yes" : "No", a.kyc_verified ? "Yes" : "No", a.reviewed_at ?? "", a.admin_note]),
        ),
    },
    {
      label: "Refunds sent",
      note: "Refunded in this period",
      n: r.refunds.length,
      run: () =>
        downloadCsv(
          `refunds-${tag}.csv`,
          ["Refunded at", "Reference", "Name", "Mobile", "Amount", "Refund UPI", "Refund UTR", "Original UTR"],
          r.refunds.map((a) => [a.refunded_at, appRef(a), a.full_name, a.phone, a.fee, a.refund_upi_id ?? "", a.refund_reference ?? "", a.transaction_id]),
        ),
    },
    {
      label: "Loans disbursed",
      note: "Disbursed in this period",
      n: r.disbursed.length,
      run: () =>
        downloadCsv(
          `disbursements-${tag}.csv`,
          ["Disbursed on", "Loan account no", "Reference", "Borrower", "Mobile", "Sanctioned", "Credited", "Credited to", "Rate %", "Tenure", "EMI", "First EMI"],
          r.disbursed.map((l) => [
            l.loan.disbursed_on,
            l.loan.loan_account_no,
            appRef(l.app),
            l.app.full_name,
            l.app.phone,
            l.loan.sanctioned_amount,
            l.loan.disbursed_amount,
            l.loan.disbursed_to,
            l.loan.interest_rate != null ? Number(l.loan.interest_rate) : "",
            l.loan.tenure_months,
            l.rows[0]?.emi ?? l.loan.emi_amount,
            l.loan.first_emi_date,
          ]),
        ),
    },
    {
      label: "EMI payments",
      note: "Paid in this period",
      n: r.emis.length,
      run: () =>
        downloadCsv(
          `emi-payments-${tag}.csv`,
          ["Paid on", "Borrower", "Mobile", "Reference", "Loan account no", "EMI no", "Amount", "Payment reference"],
          r.emis.map((p) => {
            const a = names.get(p.application_id);
            const l = ctx.loans.find((x) => x.application_id === p.application_id);
            return [p.paid_on, a?.full_name ?? "", a?.phone ?? "", a ? appRef(a) : "", l?.loan_account_no ?? "", p.instalment_no, p.amount, p.reference];
          }),
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <label className="flex flex-col text-xs font-semibold text-muted">
          Period
          <select className="mt-1 lg:!w-56" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="3m">Last 3 months</option>
            <option value="fy">This financial year</option>
            <option value="all">All time</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {preset === "custom" ? (
          <div className="grid grid-cols-2 gap-2 lg:w-96">
            <label className="block text-xs font-semibold text-muted">
              From
              <input type="date" className="mt-1" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-muted">
              To
              <input type="date" className="mt-1" value={to} min={from} max={ctx.today} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {preset === "all" ? "Everything to date" : `${new Date(start).toLocaleDateString("en-IN", { dateStyle: "medium" })} – ${new Date(end).toLocaleDateString("en-IN", { dateStyle: "medium" })}`}
          </p>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Applications" value={String(r.apps.length)} foot={`${r.decided.length} decided · avg ${r.avgReview ?? "—"} h`} />
        <Stat label="Approval rate" value={approvalRate == null ? "—" : `${approvalRate}%`} foot={`${r.approved.length} approved · ${r.declined.length} declined`} tone="ok" />
        <Stat label="Fees kept" value={rupees(feeTotal - refundTotal)} foot={`${rupees(feeTotal)} confirmed · ${rupees(refundTotal)} refunded`} tone="gold" />
        <Stat label="Loans" value={rupeesShort(disbTotal)} foot={`${plural(r.disbursed.length, "loan")} disbursed · ${rupeesShort(emiTotal)} EMIs in`} />
      </section>

      <section className="card overflow-hidden">
        <h2 className="display border-b hairline px-5 py-4 text-lg sm:px-6">Month by month</h2>
        {r.months.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">Nothing happened in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-right text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold sm:px-6">Month</th>
                  <th className="px-4 py-3 font-semibold">Applied</th>
                  <th className="px-4 py-3 font-semibold">Approved</th>
                  <th className="px-4 py-3 font-semibold">Declined</th>
                  <th className="px-4 py-3 font-semibold">Fees confirmed</th>
                  <th className="px-4 py-3 font-semibold">Refunds sent</th>
                  <th className="px-4 py-3 font-semibold">Disbursed</th>
                  <th className="px-5 py-3 font-semibold sm:px-6">EMIs collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-right tabular-nums">
                {r.months.map(([m, v]) => (
                  <tr key={m}>
                    <td className="px-5 py-3 text-left font-semibold sm:px-6">{monthLabel(m)}</td>
                    <td className="px-4 py-3">{v.apps}</td>
                    <td className="px-4 py-3 text-ok">{v.approved}</td>
                    <td className="px-4 py-3">{v.declined}</td>
                    <td className="px-4 py-3">{rupees(v.fees)}</td>
                    <td className="px-4 py-3">{rupees(v.refunds)}</td>
                    <td className="px-4 py-3">{rupees(v.disbursed)}</td>
                    <td className="px-5 py-3 font-semibold sm:px-6">{rupees(v.emis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <h2 className="display text-lg">By category</h2>
          <p className="text-xs text-muted">Applications in the period, and approval rate of those decided</p>
          <ul className="mt-4 space-y-3">
            {r.byCat.map((c) => (
              <li key={c.c}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{c.c}</span>
                  <span className="text-muted">
                    {c.apps} applied · {c.rate == null ? "no decisions" : `${c.rate}% approved`}
                  </span>
                </div>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <span className="block h-full rounded-full bg-gradient-to-r from-brand to-gold" style={{ width: `${c.rate ?? 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="display text-lg">Download</h2>
          <p className="text-xs text-muted">CSV files for this period; open in Excel or Google Sheets</p>
          <ul className="mt-4 divide-y divide-line">
            {exports.map((x) => (
              <li key={x.label} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold">{x.label}</p>
                  <p className="text-xs text-muted">
                    {x.note} · {x.n} row{x.n === 1 ? "" : "s"}
                  </p>
                </div>
                <button type="button" className="btn btn-outline btn-sm" disabled={!x.n} onClick={x.run}>
                  <Download size={14} /> CSV
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
