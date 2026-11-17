"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Mail, MessageCircle, Phone } from "lucide-react";
import { appRef, dateOnly, rupees, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone-auth";
import { downloadCsv } from "@/lib/csv";
import { useSettings } from "@/lib/settings-context";
import { StatusBadge } from "../ui";
import type { AdminCtx } from "./admin-console";
import { ApprovalQuickActions, ApprovalShare } from "./approval-share";
import type { Application } from "@/lib/types";

/** Latest approved application of a customer (drives the approval + referral message). */
function latestApproved(apps: Application[]) {
  return [...apps].filter((a) => a.status === "accepted").sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
}
import { Empty, ExportButton, initials, Pill, plural, SearchBox, Segmented, Stat } from "./kit";
import { CUSTOMER_STATE, LOAN_STATUS, whatsappLink, type Customer } from "./portfolio";

type Filter = "all" | "approved" | "in_review" | "repeat";

export function CustomersPanel({ ctx, selected, select }: { ctx: AdminCtx; selected: string | null; select: (id: string | null) => void }) {
  const customer = selected ? ctx.customers.find((c) => c.id === selected) : null;
  if (customer) return <CustomerProfile c={customer} ctx={ctx} back={() => select(null)} />;
  return <CustomerList ctx={ctx} select={select} />;
}

/* ================================================================ List */

function CustomerList({ ctx, select }: { ctx: AdminCtx; select: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const all = ctx.customers;

  const match: Record<Filter, (c: Customer) => boolean> = {
    all: () => true,
    approved: (c) => c.apps.some((a) => a.status === "accepted"),
    in_review: (c) => c.apps.some((a) => a.status === "pending"),
    repeat: (c) => c.apps.length > 1,
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    return all.filter(match[filter]).filter((c) => {
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (digits.length >= 3 && c.phone.includes(digits)) ||
        (c.email ?? "").toLowerCase().includes(needle) ||
        c.apps.some((a) => appRef(a).toLowerCase().includes(needle)) ||
        c.loans.some((l) => l.loan.loan_account_no.toLowerCase().includes(needle))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, q]);

  const approved = all.filter(match.approved).length;

  function exportCsv() {
    downloadCsv(
      `customers-${ctx.today}.csv`,
      ["Name", "Mobile", "Email", "Category", "Status", "Applications", "Loans", "Sanctioned by bank", "Fees paid", "First applied", "Last activity"],
      rows.map((c) => [
        c.name,
        c.phone,
        c.email ?? "",
        c.category,
        CUSTOMER_STATE[c.state].label,
        c.apps.length,
        c.loans.length,
        c.borrowed,
        c.feesPaid,
        c.firstSeen.slice(0, 10),
        c.lastActivity.slice(0, 10),
      ]),
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Customers" value={all.length.toLocaleString("en-IN")} foot="Everyone who has applied" />
        <Stat label="Approved" value={approved.toLocaleString("en-IN")} foot="At least one approved application" tone="ok" onClick={() => setFilter("approved")} />
        <Stat label="In review" value={all.filter(match.in_review).length.toLocaleString("en-IN")} foot="Waiting for a decision" tone="warn" onClick={() => setFilter("in_review")} />
        <Stat label="Repeat applicants" value={all.filter(match.repeat).length.toLocaleString("en-IN")} foot="More than one application" onClick={() => setFilter("repeat")} />
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Filter customers"
          value={filter}
          onChange={setFilter}
          options={[
            ["all", "All", all.length],
            ["approved", "Approved", approved],
            ["in_review", "In review", all.filter(match.in_review).length],
            ["repeat", "Repeat", all.filter(match.repeat).length],
          ]}
        />
        <div className="flex gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Name, mobile, email, MP- or loan no." />
          <ExportButton onClick={exportCsv} disabled={!rows.length} label="CSV" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty>{q ? "No customers match your search." : "No customers here yet."}</Empty>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b hairline bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Applications</th>
                  <th className="px-5 py-3 text-right font-semibold">Sanctioned</th>
                  <th className="px-5 py-3 font-semibold">Last activity</th>
                  <th className="px-5 py-3 font-semibold">Send approval</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => select(c.id)} className="cursor-pointer transition hover:bg-white/[0.03]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} />
                        <div className="min-w-0">
                          <button type="button" className="text-left font-semibold hover:underline" onClick={() => select(c.id)}>
                            {c.name}
                          </button>
                          <p className="truncate text-xs text-muted">
                            {formatPhone(c.phone)} · {c.category}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`chip ${CUSTOMER_STATE[c.state].cls}`}>{CUSTOMER_STATE[c.state].label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums">{c.apps.length}</td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{c.borrowed ? rupees(c.borrowed) : "—"}</td>
                    <td className="px-5 py-3.5 text-xs text-muted">{timeAgo(c.lastActivity)}</td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <ApprovalQuickActions app={latestApproved(c.apps)} ctx={ctx} email={c.email} />
                    </td>
                    <td className="pr-4 text-faint">
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {rows.map((c) => (
                <li key={c.id} className="px-4 py-4">
                  <button type="button" onClick={() => select(c.id)} className="flex w-full items-center gap-3 text-left">
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-semibold">{c.name}</p>
                        {c.borrowed > 0 && <p className="shrink-0 text-sm font-semibold">{rupees(c.borrowed)}</p>}
                      </div>
                      <p className="truncate text-xs text-muted">
                        {formatPhone(c.phone)} · {plural(c.apps.length, "application")}
                      </p>
                      <span className={`chip mt-2 ${CUSTOMER_STATE[c.state].cls}`}>{CUSTOMER_STATE[c.state].label}</span>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-faint" />
                  </button>
                  {latestApproved(c.apps) && (
                    <div className="mt-3 pl-12">
                      <ApprovalQuickActions app={latestApproved(c.apps)} ctx={ctx} email={c.email} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Avatar({ name, big = false }: { name: string; big?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-white/[0.06] font-bold text-ink-2 ${big ? "size-14 text-lg" : "size-9 text-xs"}`}>{initials(name)}</span>
  );
}

/* ================================================================ Profile */

function CustomerProfile({ c, ctx, back }: { c: Customer; ctx: AdminCtx; back: () => void }) {
  const { site } = useSettings();
  const company = site?.company_name ?? "Money Pay";
  const hello = `Hello ${c.name.split(" ")[0]}, this is ${company}.`;
  const fees = c.apps.filter((a) => a.payment_verified);
  // Latest approved application: drives the "approval + referral link" message
  const approvedApp = latestApproved(c.apps);

  return (
    <div className="space-y-5">
      <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={back}>
        <ArrowLeft size={15} /> All customers
      </button>

      {/* Header */}
      <section className="card card-glow p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={c.name} big />
            <div className="min-w-0">
              <h2 className="display truncate text-2xl">{c.name}</h2>
              <p className="mt-0.5 text-sm text-muted">
                {formatPhone(c.phone)}
                {c.email && <> · {c.email}</>}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`chip ${CUSTOMER_STATE[c.state].cls}`}>{CUSTOMER_STATE[c.state].label}</span>
                <Pill tone="muted">{c.category}</Pill>
                <Pill tone="muted">Customer since {dateOnly(c.firstSeen)}</Pill>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-outline btn-sm" href={`tel:+91${c.phone}`}>
              <Phone size={14} /> Call
            </a>
            <a className="btn btn-outline btn-sm" href={whatsappLink(c.phone, hello)} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={14} /> WhatsApp
            </a>
            {c.email && (
              <a className="btn btn-outline btn-sm" href={`mailto:${c.email}`}>
                <Mail size={14} /> Email
              </a>
            )}
          </div>
        </div>
        {approvedApp && (
          <div className="mt-5">
            <ApprovalShare app={approvedApp} ctx={ctx} email={c.email} />
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <Stat label="Applications" value={String(c.apps.length)} foot={`${c.apps.filter((a) => a.status === "accepted").length} approved`} />
        <Stat label="Sanctioned by bank" value={c.borrowed ? rupees(c.borrowed) : "—"} foot={plural(c.loans.length, "loan")} />
        <Stat label="Fees paid" value={c.feesPaid ? rupees(c.feesPaid) : "—"} foot="Application fees verified" tone="ok" />
      </section>

      {/* Loans */}
      <section className="card overflow-hidden">
        <h3 className="border-b hairline px-5 py-4 font-bold sm:px-6">Loans</h3>
        {c.loans.length === 0 ? (
          <Empty>No bank loan recorded yet. Add the bank&rsquo;s sanction details from the approved application.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {c.loans.map((l) => (
              <li key={l.app.id}>
                <button type="button" onClick={() => ctx.open(l.app.id)} className="w-full px-5 py-4 text-left transition hover:bg-white/[0.03] sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {l.loan.sanctioned_amount ? rupees(l.loan.sanctioned_amount) : "Amount not set"}
                        <span className="ml-2 font-mono text-xs font-normal text-muted">{l.loan.loan_account_no || appRef(l.app)}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {l.loan.interest_rate != null && l.loan.tenure_months ? `${Number(l.loan.interest_rate)}% · ${l.loan.tenure_months} months` : "Terms not recorded"}
                        {l.loan.disbursed_on ? ` · disbursed ${dateOnly(l.loan.disbursed_on)}` : " · not disbursed yet"}
                      </p>
                    </div>
                    <Pill tone={l.loan.status === "closed" ? "muted" : "info"}>{LOAN_STATUS[l.loan.status]}</Pill>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Applications */}
      <section className="card overflow-hidden">
        <h3 className="border-b hairline px-5 py-4 font-bold sm:px-6">Applications</h3>
        <ul className="divide-y divide-line">
          {c.apps.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => ctx.open(a.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.03] sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {rupees(a.requested_amount)} <span className="ml-1 font-mono text-xs font-normal text-muted">{appRef(a)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Applied {dateOnly(a.created_at)} as {a.category}
                    {a.reviewed_at && <> · decided {dateOnly(a.reviewed_at)}</>}
                  </p>
                  {a.status === "rejected" && a.admin_note && <p className="mt-1 line-clamp-2 text-xs text-ink-2">“{a.admin_note}”</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                  <StatusBadge status={a.status} />
                </div>
                <ChevronRight size={16} className="shrink-0 text-faint" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Fees */}
      <section className="card overflow-hidden">
        <h3 className="border-b hairline px-5 py-4 font-bold sm:px-6">Fee payments</h3>
        {c.apps.length === 0 ? (
          <Empty>No payments.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold sm:px-6">Paid</th>
                  <th className="px-5 py-3 font-semibold">UTR</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.apps.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-3 sm:px-6">
                      ₹{a.fee} <span className="text-xs text-muted">· {dateOnly(a.created_at)}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{a.transaction_id}</td>
                    <td className="px-5 py-3">
                      {a.status === "pending" ? <Pill tone="warn">Not checked yet</Pill> : a.payment_verified ? <Pill tone="ok">Received</Pill> : <Pill tone="bad">Not found</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t hairline px-5 py-3 text-xs text-muted sm:px-6">
          {fees.length} confirmed payment{fees.length === 1 ? "" : "s"} · {rupees(c.feesPaid)} total fees confirmed
        </p>
      </section>
    </div>
  );
}
