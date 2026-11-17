"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { appRef, dateOnly, rupees, rupeesShort } from "@/lib/format";
import { formatPhone } from "@/lib/phone-auth";
import { downloadCsv } from "@/lib/csv";
import type { AdminCtx } from "./admin-console";
import { Empty, ExportButton, Pill, SearchBox, Segmented, Stat } from "./kit";
import { LOAN_STATUS, type LoanRow } from "./portfolio";

/**
 * Broker view of loans: what the partner bank sanctioned and disbursed for each approved
 * applicant. EMIs and collections are handled by the bank, so they are not tracked here.
 */
type Filter = "open" | "setup" | "closed" | "all";

export function LoansPanel({ ctx }: { ctx: AdminCtx }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const all = ctx.loanRows;
  // Approved applications that don't have a loan record yet
  const missing = ctx.apps.filter((a) => a.status === "accepted" && !all.some((l) => l.app.id === a.id));

  const match: Record<Filter, (l: LoanRow) => boolean> = {
    open: (l) => l.loan.status !== "closed",
    setup: (l) => !l.loan.sanctioned_amount || !l.loan.disbursed_on,
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
  const sanctioned = all.reduce((s, l) => s + (l.loan.sanctioned_amount ?? 0), 0);
  const disbursedRows = all.filter((l) => l.loan.disbursed_on);
  const disbursed = disbursedRows.reduce((s, l) => s + (l.loan.disbursed_amount ?? l.loan.sanctioned_amount ?? 0), 0);

  function exportCsv() {
    downloadCsv(
      `loans-${ctx.today}.csv`,
      ["Reference", "Bank loan account no", "Borrower", "Mobile", "Status", "Sanctioned", "Rate %", "Tenure (months)", "Disbursed on", "Amount credited"],
      rows.map((l) => [
        appRef(l.app),
        l.loan.loan_account_no,
        l.app.full_name,
        l.app.phone,
        LOAN_STATUS[l.loan.status],
        l.loan.sanctioned_amount,
        l.loan.interest_rate != null ? Number(l.loan.interest_rate) : "",
        l.loan.tenure_months,
        l.loan.disbursed_on,
        l.loan.disbursed_amount,
      ]),
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Open loans" value={open.length.toLocaleString("en-IN")} foot={`${all.length} recorded in total`} onClick={() => setFilter("open")} />
        <Stat label="Sanctioned by banks" value={rupeesShort(sanctioned)} foot="Across all recorded loans" tone="gold" />
        <Stat label="Disbursed" value={rupeesShort(disbursed)} foot={`${disbursedRows.length} loans credited`} tone="ok" />
        <Stat
          label="Details missing"
          value={String(missing.length + all.filter(match.setup).length)}
          foot="Approved, no sanction / disbursal recorded"
          tone={missing.length ? "warn" : "default"}
          onClick={() => setFilter("setup")}
        />
      </section>

      {missing.length > 0 && (
        <div className="card flex flex-col gap-3 border-gold/30 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm">
            <strong>{missing.length} approved application{missing.length === 1 ? "" : "s"}</strong>{" "}
            <span className="text-muted">have no loan details from the bank yet.</span>
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
            ["setup", "Details missing", all.filter(match.setup).length],
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
          <Empty>{q ? "No loans match your search." : "No loans here."}</Empty>
        ) : (
          <>
            <table className="hidden w-full text-sm lg:table">
              <thead className="border-b hairline bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Borrower</th>
                  <th className="px-5 py-3 text-right font-semibold">Sanctioned</th>
                  <th className="px-5 py-3 font-semibold">Disbursed</th>
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
            <ul className="divide-y divide-line lg:hidden">
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

function Disbursal({ l }: { l: LoanRow }) {
  if (!l.loan.disbursed_on) return <span className="text-warn">Not yet</span>;
  const amt = l.loan.disbursed_amount ?? l.loan.sanctioned_amount;
  return (
    <span>
      {amt ? rupees(amt) : "—"} <span className="text-muted">on {dateOnly(l.loan.disbursed_on)}</span>
    </span>
  );
}

function Status({ l }: { l: LoanRow }) {
  return <Pill tone={l.loan.status === "closed" ? "muted" : "info"}>{LOAN_STATUS[l.loan.status]}</Pill>;
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
        <p className="text-xs text-muted">
          {l.loan.interest_rate != null && l.loan.tenure_months ? `${Number(l.loan.interest_rate)}% · ${l.loan.tenure_months} m` : "—"}
        </p>
      </td>
      <td className="px-5 py-3.5 text-xs">
        <Disbursal l={l} />
      </td>
      <td className="px-5 py-3.5">
        <Status l={l} />
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
          <p className="shrink-0 font-semibold">{l.loan.sanctioned_amount ? rupees(l.loan.sanctioned_amount) : "—"}</p>
        </div>
        <p className="mt-2 text-xs">
          <Disbursal l={l} />
        </p>
        <div className="mt-2">
          <Status l={l} />
        </div>
      </button>
    </li>
  );
}
