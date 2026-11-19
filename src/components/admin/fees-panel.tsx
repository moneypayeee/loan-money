"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { appRef, dateTime, rupees } from "@/lib/format";
import { formatPhone } from "@/lib/phone-auth";
import { downloadCsv } from "@/lib/csv";
import type { Application } from "@/lib/types";
import type { AdminCtx } from "./admin-console";
import { Empty, ExportButton, Pill, plural, SearchBox, Segmented, Stat } from "./kit";

type Filter = "all" | "to_check" | "received" | "not_found";

const label = (a: Application): { text: string; tone: "ok" | "warn" | "bad" } =>
  a.status === "pending"
    ? { text: "To check", tone: "warn" }
    : a.payment_verified
      ? { text: "Received", tone: "ok" }
      : { text: "Not found", tone: "bad" };

/** Last 12 months as YYYY-MM, newest first. */
function lastMonths(today: string) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}
const monthName = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export function FeesPanel({ ctx }: { ctx: AdminCtx }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [month, setMonth] = useState("");
  const [q, setQ] = useState("");

  const inMonth = useMemo(() => ctx.apps.filter((a) => !month || a.created_at.slice(0, 7) === month), [ctx.apps, month]);

  const match: Record<Filter, (a: Application) => boolean> = {
    all: () => true,
    to_check: (a) => a.status === "pending",
    received: (a) => a.status !== "pending" && a.payment_verified,
    not_found: (a) => a.status !== "pending" && !a.payment_verified,
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inMonth
      .filter(match[filter])
      .filter((a) => !needle || [a.full_name, a.phone, a.transaction_id, appRef(a)].some((s) => s.toLowerCase().includes(needle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inMonth, filter, q]);

  const verified = inMonth.filter((a) => a.payment_verified);
  const received = verified.reduce((s, a) => s + a.fee, 0);
  const notFound = inMonth.filter(match.not_found);
  const toCheck = inMonth.filter(match.to_check);

  function exportCsv() {
    downloadCsv(
      `fee-payments-${month || "all"}-${ctx.today}.csv`,
      ["Submitted", "Reference", "Name", "Mobile", "Fee", "UTR", "Paid to", "Payee UPI", "Payment status", "Decision", "Decided at"],
      rows.map((a) => [
        a.created_at,
        appRef(a),
        a.full_name,
        a.phone,
        a.fee,
        a.transaction_id,
        a.payee_name,
        a.upi_id,
        label(a).text,
        a.status,
        a.reviewed_at ?? "",
      ]),
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Confirmed received" value={rupees(received)} foot={plural(verified.length, "payment")} tone="ok" onClick={() => setFilter("received")} />
        <Stat
          label="To check"
          value={String(toCheck.length)}
          foot={`${rupees(toCheck.reduce((s, a) => s + a.fee, 0))} awaiting confirmation`}
          tone={toCheck.length ? "warn" : "default"}
          onClick={() => setFilter("to_check")}
        />
        <Stat label="Not found" value={String(notFound.length)} foot="UTR not verified in account" tone="bad" onClick={() => setFilter("not_found")} />
        <Stat label="Total fee volume" value={rupees(inMonth.reduce((s, a) => s + a.fee, 0))} foot={`${inMonth.length} applications submitted`} tone="gold" />
      </section>

      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <Segmented
          label="Filter payments"
          value={filter}
          onChange={setFilter}
          options={[
            ["all", "All", inMonth.length],
            ["to_check", "To check", toCheck.length],
            ["received", "Received", inMonth.filter(match.received).length],
            ["not_found", "Not found", inMonth.filter(match.not_found).length],
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row 2xl:w-auto">
          <select className="sm:!w-48" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            <option value="">All time</option>
            {lastMonths(ctx.today).map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
          <SearchBox value={q} onChange={setQ} placeholder="UTR, name, mobile or MP-" />
          <ExportButton onClick={exportCsv} disabled={!rows.length} label="CSV" />
          <button type="button" onClick={() => ctx.go("settings")} className="btn btn-gold btn-sm flex shrink-0 items-center gap-1.5 font-semibold">
            <Settings size={14} /> Fee &amp; QR settings
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty>{q ? "No payments match your search." : "No payments here."}</Empty>
        ) : (
          <>
            <table className="hidden w-full text-sm lg:table">
              <thead className="border-b hairline bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Paid by</th>
                  <th className="px-5 py-3 font-semibold">UTR</th>
                  <th className="px-5 py-3 font-semibold">Paid to</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => {
                  const s = label(a);
                  return (
                    <tr key={a.id} onClick={() => ctx.open(a.id)} className="cursor-pointer transition hover:bg-white/[0.03]">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold">{a.full_name}</p>
                        <p className="text-xs text-muted">{formatPhone(a.phone)}</p>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs">{a.transaction_id}</td>
                      <td className="px-5 py-3.5 text-xs text-muted">
                        {a.payee_name}
                        <span className="block font-mono">{a.upi_id}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted">{dateTime(a.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <Pill tone={s.tone}>{s.text}</Pill>
                      </td>
                      <td className="pr-4 text-faint">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ul className="divide-y divide-line lg:hidden">
              {rows.map((a) => {
                const s = label(a);
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => ctx.open(a.id)} className="w-full px-4 py-4 text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{a.full_name}</p>
                          <p className="truncate font-mono text-xs text-muted">{a.transaction_id}</p>
                        </div>
                        <Pill tone={s.tone}>{s.text}</Pill>
                      </div>
                      <p className="mt-1 text-xs text-muted">{dateTime(a.created_at)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <p className="text-xs text-muted">Export a month and match each UTR against your bank statement. A UTR can only be used once; the database rejects duplicates.</p>

    </div>
  );
}
