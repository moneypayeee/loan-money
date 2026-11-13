"use client";

import { useMemo, useState } from "react";
import { ChevronRight, KeyRound } from "lucide-react";
import { appRef, dateOnly, rupees, rupeesShort } from "@/lib/format";
import { formatPhone } from "@/lib/phone-auth";
import { downloadCsv } from "@/lib/csv";
import type { AdminCtx } from "./admin-console";
import { Bar, Empty, ExportButton, Pill, plural, SearchBox, Segmented, Stat } from "./kit";
import { dpdBucket, LOAN_STATUS, type LoanRow } from "./portfolio";

type Filter = "open" | "overdue" | "setup" | "no_login" | "closed" | "all";

export function LoansPanel({ ctx }: { ctx: AdminCtx }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const all = ctx.loanRows;
  // Approved applications that don't have a loan record yet
  const missing = ctx.apps.filter((a) => a.status === "accepted" && !all.some((l) => l.app.id === a.id));

  const match: Record<Filter, (l: LoanRow) => boolean> = {
    open: (l) => l.loan.status !== "closed",
    overdue: (l) => l.overdueCount > 0,
    setup: (l) => !l.complete || !l.loan.disbursed_on,
    no_login: (l) => l.loan.status !== "closed" && !l.access,
    closed: (l) => l.loan.status === "closed",
    all: () => true,
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(match[filter]).filter(
      (l) =>
        !needle ||
        [l.app.full_name, l.app.phone, l.loan.loan_account_no, appRef(l.app)].some((s) => s.toLowerCase().includes(needle)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, q]);

  const open = all.filter(match.open);
  const book = open.reduce((s, l) => s + l.outstanding, 0);
  const disbursed = all.reduce((s, l) => s + (l.loan.disbursed_on ? l.loan.disbursed_amount ?? l.loan.sanctioned_amount ?? 0 : 0), 0);
  const overdueAmt = all.reduce((s, l) => s + l.overdueAmount, 0);
  const collected = all.reduce((s, l) => s + l.paidAmount, 0);

  function exportCsv() {
    downloadCsv(
      `loans-${ctx.today}.csv`,
      [
        "Reference",
        "Loan account no",
        "Borrower",
        "Mobile",
        "Status",
        "Sanctioned",
        "Rate %",
        "Tenure (months)",
        "EMI",
        "First EMI",
        "Disbursed on",
        "Amount credited",
        "EMIs paid",
        "EMIs total",
        "Paid so far",
        "Outstanding principal",
        "Overdue EMIs",
        "Overdue amount",
        "Days past due",
        "Next due",
        "Borrower login",
      ],
      rows.map((l) => [
        appRef(l.app),
        l.loan.loan_account_no,
        l.app.full_name,
        l.app.phone,
        LOAN_STATUS[l.loan.status],
        l.loan.sanctioned_amount,
        l.loan.interest_rate != null ? Number(l.loan.interest_rate) : "",
        l.loan.tenure_months,
        l.rows[0]?.emi ?? l.loan.emi_amount,
        l.loan.first_emi_date,
        l.loan.disbursed_on,
        l.loan.disbursed_amount,
        l.paidCount,
        l.total,
        l.paidAmount,
        l.outstanding,
        l.overdueCount,
        l.overdueAmount,
        l.dpd,
        l.next?.date ?? "",
        l.access ? (l.access.last_login_at ? `Last ${l.access.last_login_at.slice(0, 10)}` : "Issued, never used") : "Not issued",
      ]),
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Open loans" value={open.length.toLocaleString("en-IN")} foot={`${all.length} in total`} onClick={() => setFilter("open")} />
        <Stat label="Outstanding" value={rupeesShort(book)} foot={`${rupeesShort(disbursed)} disbursed`} tone="gold" />
        <Stat label="Collected" value={rupeesShort(collected)} foot="EMIs recorded as paid" tone="ok" />
        <Stat
          label="Overdue"
          value={rupeesShort(overdueAmt)}
          foot={`${plural(all.filter(match.overdue).length, "loan")} with late EMIs`}
          tone={overdueAmt ? "bad" : "default"}
          onClick={() => setFilter("overdue")}
        />
      </section>

      {missing.length > 0 && (
        <div className="card flex flex-col gap-3 border-gold/30 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm">
            <strong>{missing.length} approved application{missing.length === 1 ? "" : "s"}</strong>{" "}
            <span className="text-muted">have no loan details yet, so they aren&rsquo;t on the loan book.</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {missing.slice(0, 3).map((a) => (
              <button key={a.id} type="button" className="btn btn-outline btn-sm" onClick={() => ctx.open(a.id)}>
                Add for {a.full_name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Filter loans"
          value={filter}
          onChange={setFilter}
          options={[
            ["open", "Open", open.length],
            ["overdue", "Overdue", all.filter(match.overdue).length],
            ["setup", "Needs setup", all.filter(match.setup).length],
            ["no_login", "No login", all.filter(match.no_login).length],
            ["closed", "Closed", all.filter(match.closed).length],
            ["all", "All", all.length],
          ]}
        />
        <div className="flex gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Name, mobile, loan no. or MP-" />
          <ExportButton onClick={exportCsv} disabled={!rows.length} label="CSV" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty>{q ? "No loans match your search." : filter === "overdue" ? "No overdue EMIs. Everyone is on time." : "No loans here."}</Empty>
        ) : (
          <>
            <table className="hidden w-full text-sm xl:table">
              <thead className="border-b hairline bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Borrower</th>
                  <th className="px-5 py-3 text-right font-semibold">Loan</th>
                  <th className="px-5 py-3 font-semibold">Repayment</th>
                  <th className="px-5 py-3 text-right font-semibold">Outstanding</th>
                  <th className="px-5 py-3 font-semibold">Next / overdue</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((l) => (
                  <LoanTr key={l.app.id} l={l} ctx={ctx} />
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line xl:hidden">
              {rows.map((l) => (
                <LoanLi key={l.app.id} l={l} ctx={ctx} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Due({ l }: { l: LoanRow }) {
  if (l.loan.status === "closed") return <span className="text-muted">Repaid</span>;
  if (!l.complete) return <span className="text-warn">Terms not set</span>;
  if (l.firstOverdue)
    return (
      <span className="font-semibold text-bad">
        {rupees(l.overdueAmount)} · {l.dpd} d late
      </span>
    );
  if (l.next)
    return (
      <span>
        {rupees(l.next.emi)} on {dateOnly(l.next.date)}
      </span>
    );
  return <span className="text-muted">All EMIs paid</span>;
}

function Tags({ l }: { l: LoanRow }) {
  const b = dpdBucket(l.dpd);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill tone={l.loan.status === "closed" ? "muted" : "info"}>{LOAN_STATUS[l.loan.status]}</Pill>
      {l.loan.status !== "closed" && l.dpd > 0 && <Pill tone={b.tone}>{b.label}</Pill>}
      {l.loan.status !== "closed" && !l.access && (
        <Pill tone="warn">
          <KeyRound size={11} /> No login
        </Pill>
      )}
    </div>
  );
}

function LoanTr({ l, ctx }: { l: LoanRow; ctx: AdminCtx }) {
  return (
    <tr onClick={() => ctx.open(l.app.id)} className="cursor-pointer transition hover:bg-white/[0.03]">
      <td className="px-5 py-3.5">
        <button
          type="button"
          className="text-left font-semibold hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            ctx.openCustomer(l.app.user_id);
          }}
        >
          {l.app.full_name}
        </button>
        <p className="text-xs text-muted">
          {formatPhone(l.app.phone)} · <span className="font-mono">{l.loan.loan_account_no || appRef(l.app)}</span>
        </p>
      </td>
      <td className="px-5 py-3.5 text-right">
        <p className="font-semibold tabular-nums">{l.loan.sanctioned_amount ? rupees(l.loan.sanctioned_amount) : "—"}</p>
        <p className="text-xs text-muted">{l.complete ? `${Number(l.loan.interest_rate)}% · ${l.loan.tenure_months} m` : "—"}</p>
      </td>
      <td className="w-48 px-5 py-3.5">
        {l.complete ? (
          <>
            <Bar value={l.paidCount} total={l.total} />
            <p className="mt-1.5 text-xs text-muted">
              {l.paidCount} of {l.total} EMIs paid
            </p>
          </>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{l.outstanding ? rupees(l.outstanding) : "—"}</td>
      <td className="px-5 py-3.5 text-xs">
        <Due l={l} />
      </td>
      <td className="px-5 py-3.5">
        <Tags l={l} />
      </td>
      <td className="pr-4 text-faint">
        <ChevronRight size={16} />
      </td>
    </tr>
  );
}

function LoanLi({ l, ctx }: { l: LoanRow; ctx: AdminCtx }) {
  return (
    <li>
      <button type="button" onClick={() => ctx.open(l.app.id)} className="w-full px-4 py-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{l.app.full_name}</p>
            <p className="truncate text-xs text-muted">
              {formatPhone(l.app.phone)} · <span className="font-mono">{l.loan.loan_account_no || appRef(l.app)}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold">{l.loan.sanctioned_amount ? rupees(l.loan.sanctioned_amount) : "—"}</p>
            <p className="text-xs text-muted">{l.outstanding ? `${rupees(l.outstanding)} left` : ""}</p>
          </div>
        </div>
        {l.complete && (
          <div className="mt-3 flex items-center gap-3">
            <Bar value={l.paidCount} total={l.total} />
            <span className="shrink-0 text-xs text-muted">
              {l.paidCount}/{l.total}
            </span>
          </div>
        )}
        <p className="mt-2 text-xs">
          <Due l={l} />
        </p>
        <div className="mt-2">
          <Tags l={l} />
        </div>
      </button>
    </li>
  );
}
