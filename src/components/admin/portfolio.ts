/**
 * Derived views over the admin console's data: one row per loan (with its EMI
 * schedule and repayment status) and one row per customer (an applicant account
 * with all of its applications and loans).
 *
 * Everything is computed from loans + loan_payments with the same maths the
 * borrower dashboard uses (lib/loan-math), so admin and borrower always agree.
 */
import { progress, schedule, withStatus, type ScheduleRowWithStatus } from "@/lib/loan-math";
import { daysBetween } from "@/lib/format";
import type { AdminLoanPayment, Application, BorrowerAccess, Loan } from "@/lib/types";

export type LoanRow = {
  app: Application;
  loan: Loan;
  /** False until amount, rate, tenure and first EMI date are all saved. */
  complete: boolean;
  rows: ScheduleRowWithStatus[];
  paidCount: number;
  total: number;
  paidAmount: number;
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
  /** Oldest unpaid instalment that is already late. */
  firstOverdue: ScheduleRowWithStatus | null;
  /** Next unpaid instalment that is not late yet. */
  next: ScheduleRowWithStatus | null;
  /** Days the oldest overdue EMI is late (0 when nothing is overdue). */
  dpd: number;
  access: BorrowerAccess | null;
};

export function buildLoanRows(
  apps: Application[],
  loans: Loan[],
  payments: AdminLoanPayment[],
  access: BorrowerAccess[],
  today: string,
): LoanRow[] {
  const appById = new Map(apps.map((a) => [a.id, a]));
  const payByApp = new Map<string, AdminLoanPayment[]>();
  for (const p of payments) payByApp.set(p.application_id, [...(payByApp.get(p.application_id) ?? []), p]);
  const accessByApp = new Map(access.map((a) => [a.application_id, a]));

  const out: LoanRow[] = [];
  for (const loan of loans) {
    const app = appById.get(loan.application_id);
    if (!app) continue;
    const complete = Boolean(loan.sanctioned_amount && loan.interest_rate != null && loan.tenure_months && loan.first_emi_date);
    const rows = complete
      ? withStatus(schedule(loan.sanctioned_amount!, Number(loan.interest_rate), loan.tenure_months!, loan.first_emi_date!), payByApp.get(app.id) ?? [], today)
      : [];
    // A closed loan has nothing due, whatever the schedule says.
    const closed = loan.status === "closed";
    const p = progress(rows, loan.sanctioned_amount ?? 0);
    const firstOverdue = closed ? null : rows.find((r) => r.status === "overdue") ?? null;
    out.push({
      app,
      loan,
      complete,
      rows,
      paidCount: p.paidCount,
      total: p.total,
      paidAmount: p.paidAmount,
      outstanding: closed ? 0 : complete ? p.outstanding : loan.sanctioned_amount ?? 0,
      overdueCount: closed ? 0 : p.overdueCount,
      overdueAmount: closed ? 0 : p.overdueAmount,
      firstOverdue,
      next: closed ? null : rows.find((r) => r.status === "due") ?? null,
      dpd: firstOverdue ? daysBetween(firstOverdue.date, today) : 0,
      access: accessByApp.get(app.id) ?? null,
    });
  }
  return out.sort((a, b) => b.dpd - a.dpd || (b.app.reviewed_at ?? "").localeCompare(a.app.reviewed_at ?? ""));
}

/** Days-past-due bucket used across Loans and Collections. */
export function dpdBucket(dpd: number): { label: string; tone: "ok" | "warn" | "bad" } {
  if (dpd <= 0) return { label: "Current", tone: "ok" };
  if (dpd <= 30) return { label: "1–30 days late", tone: "warn" };
  if (dpd <= 60) return { label: "31–60 days late", tone: "bad" };
  if (dpd <= 90) return { label: "61–90 days late", tone: "bad" };
  return { label: "90+ days late", tone: "bad" };
}

export type Customer = {
  /** Applicant account id (auth user). */
  id: string;
  name: string;
  phone: string;
  email: string | null;
  category: string;
  apps: Application[];
  loans: LoanRow[];
  firstSeen: string;
  lastActivity: string;
  borrowed: number;
  outstanding: number;
  overdueAmount: number;
  maxDpd: number;
  feesPaid: number;
  /** Most useful one-word state for the list. */
  state: "borrower" | "closed" | "in_review" | "approved" | "declined";
};

export function buildCustomers(apps: Application[], loanRows: LoanRow[]): Customer[] {
  const loansByApp = new Map(loanRows.map((l) => [l.app.id, l]));
  const groups = new Map<string, Application[]>();
  for (const a of apps) groups.set(a.user_id, [...(groups.get(a.user_id) ?? []), a]);

  return [...groups.entries()]
    .map(([id, list]) => {
      const sorted = [...list].sort((x, y) => y.created_at.localeCompare(x.created_at));
      const latest = sorted[0];
      const loans = sorted.map((a) => loansByApp.get(a.id)).filter((l): l is LoanRow => Boolean(l));
      const openLoans = loans.filter((l) => l.loan.status !== "closed");
      const maxDpd = Math.max(0, ...loans.map((l) => l.dpd));
      // EMIs are managed by the partner bank, so there is no "overdue" state here.
      const state: Customer["state"] =
        openLoans.length
            ? "borrower"
            : loans.length
              ? "closed"
              : latest.status === "pending"
                ? "in_review"
                : latest.status === "accepted"
                  ? "approved"
                  : "declined";
      const activity = [
        ...sorted.map((a) => a.reviewed_at ?? a.created_at),
        ...loans.map((l) => l.loan.updated_at),
        ...loans.flatMap((l) => l.rows.filter((r) => r.payment).map((r) => r.payment!.paid_on)),
      ].sort();
      return {
        id,
        name: latest.full_name,
        phone: latest.phone,
        email: sorted.find((a) => a.contact_email)?.contact_email ?? null,
        category: latest.category,
        apps: sorted,
        loans,
        firstSeen: sorted.at(-1)!.created_at,
        lastActivity: activity.at(-1) ?? latest.created_at,
        borrowed: loans.reduce((s, l) => s + (l.loan.sanctioned_amount ?? 0), 0),
        outstanding: loans.reduce((s, l) => s + l.outstanding, 0),
        overdueAmount: loans.reduce((s, l) => s + l.overdueAmount, 0),
        maxDpd,
        feesPaid: sorted.filter((a) => a.payment_verified).reduce((s, a) => s + a.fee, 0),
        state,
      };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export const CUSTOMER_STATE: Record<Customer["state"], { label: string; cls: string }> = {
  borrower: { label: "Loan with bank", cls: "bg-ok-soft text-ok border-ok/15" },
  closed: { label: "Loan closed", cls: "bg-white/[0.05] text-ink-2 border-white/10" },
  in_review: { label: "In review", cls: "bg-warn-soft text-warn border-warn/15" },
  approved: { label: "Approved", cls: "bg-brand-soft text-brand-ink border-brand/15" },
  declined: { label: "Declined", cls: "bg-white/[0.05] text-muted border-white/10" },
};

/** wa.me link with a pre-filled message (opens WhatsApp; nothing is sent until the admin taps Send). */
export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/91${phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(text)}`;
}

export const LOAN_STATUS: Record<string, string> = {
  sanctioned: "Sanctioned",
  disbursed: "Disbursed",
  active: "Repaying",
  closed: "Closed",
};
