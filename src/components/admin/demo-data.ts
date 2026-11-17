// Sample data for the admin console's demo mode (only used when Supabase is NOT configured).
import type { ActivityEntry, AdminLoanPayment, AdminMember, Application, BorrowerAccess, DashboardStats, Kyc, Loan } from "@/lib/types";
import { addMonths, schedule } from "@/lib/loan-math";

const H = 3600e3;

function app(i: number, hoursAgo: number, o: Partial<Application>): Application {
  const created = new Date(Date.now() - hoursAgo * H).toISOString();
  return {
    id: `demo-${i}`,
    ref_code: `MP-DEMO000${i}`,
    user_id: `demo-user-${i}`,
    full_name: "Sample Applicant",
    phone: `987654${3200 + i}`,
    category: "Employed",
    requested_amount: 50000,
    transaction_id: `42819201829${i}`,
    proof_path: "",
    fee: 299,
    payee_name: "Your Business Name",
    upi_id: "business@bank",
    status: "pending",
    payment_verified: false,
    kyc_verified: false,
    admin_note: "",
    reviewed_at: null,
    created_at: created,
    refund_upi_id: `applicant${i}@okaxis`,
    refund_status: "not_applicable",
    refund_reference: null,
    refunded_at: null,
    lender_name: null,
    lender_reg_no: null,
    contact_email: null,
    kyc_status: o.status && o.status !== "pending" ? (o.kyc_verified ? "verified" : "problem") : "pending",
    kyc_note: "",
    kyc_requested_docs: [],
    kyc_reviewed_at: o.reviewed_at ?? null,
    ...o,
  };
}

const reviewed = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H).toISOString();

export function demoApps(): Application[] {
  return [
    app(1, 3, { full_name: "Asha Rao", category: "Self-employed", requested_amount: 75000 }),
    app(2, 20, { full_name: "Ravi Kumar", category: "Student", requested_amount: 20000, kyc_status: "resubmit", kyc_requested_docs: ["student"], kyc_note: "Student ID photo is blurred. Please upload a clear photo of the front.", kyc_reviewed_at: new Date(Date.now() - 6 * H).toISOString() }),
    app(3, 55, { full_name: "Imran Ali", category: "Driver", requested_amount: 40000 }),
    app(4, 72, { full_name: "Meena Sharma", status: "rejected", payment_verified: true, admin_note: "Address proof is older than 3 months. Please reapply with a recent bill.", reviewed_at: reviewed(60) }),
    app(5, 120, { full_name: "Karthik N", status: "accepted", payment_verified: true, kyc_verified: true, requested_amount: 100000, reviewed_at: reviewed(110) }),
    app(6, 150, { full_name: "Priya Verma", status: "rejected", payment_verified: true, admin_note: "Name on ID does not match the application.", reviewed_at: reviewed(140) }),
    app(7, 200, { full_name: "Sanjay Patel", status: "accepted", payment_verified: true, kyc_verified: true, category: "Employed", requested_amount: 150000, reviewed_at: reviewed(185) }),
    app(8, 24 * 140, { full_name: "Lakshmi Iyer", user_id: "demo-user-8", status: "accepted", payment_verified: true, kyc_verified: true, category: "Self-employed", requested_amount: 60000, contact_email: "lakshmi@example.com", reviewed_at: reviewed(24 * 138) }),
    app(9, 24 * 420, { full_name: "Arjun Mehta", user_id: "demo-user-9", status: "accepted", payment_verified: true, kyc_verified: true, requested_amount: 30000, reviewed_at: reviewed(24 * 418) }),
    app(10, 24 * 30, { full_name: "Ravi Kumar", user_id: "demo-user-2", phone: "9876543202", status: "rejected", payment_verified: true, category: "Student", requested_amount: 25000, admin_note: "Student ID was unreadable.", reviewed_at: reviewed(24 * 28) }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function demoStats(apps: Application[]): DashboardStats {
  const now = Date.now();
  const reviewedApps = apps.filter((a) => a.reviewed_at);
  const avg = reviewedApps.length
    ? Math.round((reviewedApps.reduce((s, a) => s + (new Date(a.reviewed_at!).getTime() - new Date(a.created_at).getTime()), 0) / reviewedApps.length / H) * 10) / 10
    : null;
  const series = [1, 0, 2, 1, 0, 1, 1, 0, 2, 0, 1, 1, 0, 1];
  return {
    total: apps.length,
    pending: apps.filter((a) => a.status === "pending").length,
    accepted: apps.filter((a) => a.status === "accepted").length,
    rejected: apps.filter((a) => a.status === "rejected").length,
    overdue: apps.filter((a) => a.status === "pending" && now - new Date(a.created_at).getTime() > 48 * H).length,
    refunds_pending: 0,
    refunds_pending_amount: 0,
    refunded_amount: 0,
    fees_retained: apps.filter((a) => a.status === "accepted").reduce((s, a) => s + a.fee, 0),
    accepted_volume: apps.filter((a) => a.status === "accepted").reduce((s, a) => s + a.requested_amount, 0),
    avg_review_hours: avg,
    daily: series.map((count, i) => ({ day: new Date(now - (13 - i) * 864e5).toISOString().slice(0, 10), count })),
  };
}

export const DEMO_KYC: Kyc = {
  dob: "1996-04-12",
  address: "12, 4th Cross, Indiranagar",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560038",
  identity_type: "Voter ID",
  identity_last4: "AB12",
  institution: null,
  identity_path: "",
  identity_back_path: null,
  address_path: "",
  student_path: null,
  consent_at: new Date().toISOString(),
};

/* ---------------------------------------------------------------- loans */

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  return addMonths(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), 28), -n);
};

function loan(id: string, o: Partial<Loan>): Loan {
  return {
    application_id: id,
    loan_account_no: "",
    sanctioned_amount: null,
    interest_rate: null,
    tenure_months: null,
    emi_amount: null,
    first_emi_date: null,
    disbursed_on: null,
    status: "sanctioned",
    note: "",
    updated_at: new Date().toISOString(),
    disbursed_amount: null,
    disbursed_to: "",
    processing_fee: null,
    apr: null,
    late_fee: "₹500 per missed EMI",
    prepayment_terms: "No charge after 6 EMIs",
    repayment_method: "auto_debit",
    repayment_details: "EMIs are auto-debited from your registered bank account.",
    repayment_link: "",
    ...o,
  };
}

export function demoLoans(): Loan[] {
  return [
    // Karthik: just sanctioned, schedule set, nothing paid yet
    loan("demo-5", { loan_account_no: "SFL/PL/24001", sanctioned_amount: 100000, interest_rate: 16, tenure_months: 12, emi_amount: 9073, first_emi_date: monthsAgo(-1), disbursed_on: iso(2), disbursed_amount: 98000, status: "disbursed" }),
    // Sanjay: repaying on time
    loan("demo-7", { loan_account_no: "SFL/PL/23987", sanctioned_amount: 150000, interest_rate: 14, tenure_months: 24, emi_amount: 7202, first_emi_date: monthsAgo(3), disbursed_on: iso(100), disbursed_amount: 147000, status: "active" }),
    // Lakshmi: two EMIs overdue
    loan("demo-8", { loan_account_no: "SFL/PL/23811", sanctioned_amount: 60000, interest_rate: 18, tenure_months: 12, emi_amount: 5501, first_emi_date: monthsAgo(4), disbursed_on: iso(135), disbursed_amount: 58500, status: "active" }),
    // Arjun: fully repaid and closed
    loan("demo-9", { loan_account_no: "SFL/PL/22450", sanctioned_amount: 30000, interest_rate: 15, tenure_months: 12, emi_amount: 2708, first_emi_date: monthsAgo(13), disbursed_on: iso(410), disbursed_amount: 29500, status: "closed" }),
  ];
}

export function demoPayments(loans: Loan[]): AdminLoanPayment[] {
  const paidCount: Record<string, number> = { "demo-7": 3, "demo-8": 2, "demo-9": 12 };
  return loans.flatMap((l) => {
    const n = paidCount[l.application_id] ?? 0;
    if (!n || !l.first_emi_date) return [];
    return schedule(l.sanctioned_amount!, Number(l.interest_rate), l.tenure_months!, l.first_emi_date)
      .slice(0, n)
      .map((r) => ({ application_id: l.application_id, instalment_no: r.no, paid_on: r.date, amount: r.emi, reference: `NACH${r.date.replace(/-/g, "")}${r.no}` }));
  });
}

export function demoAccess(): BorrowerAccess[] {
  const at = (h: number) => new Date(Date.now() - h * H).toISOString();
  return [
    { application_id: "demo-7", issued_at: at(24 * 95), last_login_at: at(30), locked_until: null },
    { application_id: "demo-8", issued_at: at(24 * 130), last_login_at: at(24 * 40), locked_until: null },
    { application_id: "demo-9", issued_at: at(24 * 400), last_login_at: at(24 * 60), locked_until: null },
  ];
}

export function demoActivity(apps: Application[]): ActivityEntry[] {
  let id = 1;
  const out: ActivityEntry[] = [];
  for (const a of apps) {
    const base = { application_id: a.id, full_name: a.full_name, ref_code: a.ref_code };
    out.push({ ...base, id: id++, kind: "submitted", note: "Application submitted", created_at: a.created_at, actor: "applicant", actor_label: "Applicant" });
    if (a.kyc_reviewed_at && a.kyc_status !== "pending")
      out.push({ ...base, id: id++, kind: `kyc_${a.kyc_status}`, note: a.kyc_note || (a.kyc_status === "verified" ? "KYC documents verified" : ""), created_at: a.kyc_reviewed_at, actor: "admin", actor_label: "demo@moneypay.local" });
    if (a.reviewed_at)
      out.push({ ...base, id: id++, kind: a.status, note: a.admin_note || (a.status === "accepted" ? "Approved" : ""), created_at: a.reviewed_at, actor: "admin", actor_label: "demo@moneypay.local" });
  }
  return out.sort((x, y) => y.created_at.localeCompare(x.created_at));
}

export function demoAdmins(): AdminMember[] {
  return [
    { user_id: "demo-admin", email: "demo@moneypay.local", created_at: new Date(Date.now() - 864e5 * 200).toISOString(), last_sign_in_at: new Date().toISOString(), is_me: true },
    { user_id: "demo-admin-2", email: "reviewer@moneypay.local", created_at: new Date(Date.now() - 864e5 * 40).toISOString(), last_sign_in_at: new Date(Date.now() - 864e5 * 2).toISOString(), is_me: false },
  ];
}
