import type { BorrowerLoanSummary, BorrowerPortalData, Loan, LoanPayment } from "./types";
import { emi, schedule } from "./loan-math.ts";

/** Sample borrower with two loans (one repaying, one repaid), shown only in demo mode. */
export function demoPortal(appId?: string | null): BorrowerPortalData {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 864e5).toISOString();
  const date = (daysFromNow: number) => new Date(now + daysFromNow * 864e5).toISOString().slice(0, 10);

  const common = {
    note: "",
    updated_at: iso(66),
    late_fee: "₹500 per missed EMI, plus 2% a month on the overdue amount.",
    prepayment_terms: "Prepay or close any time after 6 EMIs with no foreclosure charge.",
    repayment_method: "auto_debit" as const,
    repayment_details: "EMIs are auto-debited from your HDFC Bank account ending 4321 on the due date. To change the account, contact the lender.",
    repayment_link: "",
    disbursed_to: "HDFC Bank ••4321",
  };

  // Loan 1: current, 2 EMIs paid
  const l1: Omit<Loan, "application_id"> = {
    ...common,
    loan_account_no: "LN-2026-00125",
    sanctioned_amount: 90000,
    interest_rate: 14,
    tenure_months: 12,
    emi_amount: emi(90000, 14, 12),
    first_emi_date: date(-36),
    disbursed_on: date(-66),
    status: "active",
    note: "Your EMI is collected by auto-debit on the due date. Keep enough balance in your registered bank account a day before.",
    disbursed_amount: 88200,
    processing_fee: 1800,
    apr: 17.6,
  };
  const p1: LoanPayment[] = schedule(90000, 14, 12, l1.first_emi_date!)
    .slice(0, 2)
    .map((r, i) => ({ instalment_no: r.no, paid_on: r.date, amount: r.emi, reference: `NACH-${88213 + i * 2244}` }));

  // Loan 2: an earlier loan, fully repaid
  const l2: Omit<Loan, "application_id"> = {
    ...common,
    loan_account_no: "LN-2025-00841",
    sanctioned_amount: 30000,
    interest_rate: 15,
    tenure_months: 6,
    emi_amount: emi(30000, 15, 6),
    first_emi_date: date(-330),
    disbursed_on: date(-360),
    status: "closed",
    disbursed_amount: 29400,
    processing_fee: 600,
    apr: 18.2,
  };
  const p2: LoanPayment[] = schedule(30000, 15, 6, l2.first_emi_date!).map((r) => ({ instalment_no: r.no, paid_on: r.date, amount: r.emi, reference: `NACH-7${r.no}410` }));

  const pick = (l: Omit<Loan, "application_id">) => ({
    loan_account_no: l.loan_account_no,
    sanctioned_amount: l.sanctioned_amount,
    interest_rate: l.interest_rate,
    tenure_months: l.tenure_months,
    emi_amount: l.emi_amount,
    first_emi_date: l.first_emi_date,
    status: l.status,
  });
  const loans: BorrowerLoanSummary[] = [
    { application_id: "demo-loan-1", ref_code: "MP-7F3A9C21", requested_amount: 100000, reviewed_at: iso(68), lender_name: "Example Finance Pvt Ltd", loan: pick(l1), payments: p1 },
    { application_id: "demo-loan-2", ref_code: "MP-2B91E0D4", requested_amount: 30000, reviewed_at: iso(365), lender_name: "Example Finance Pvt Ltd", loan: pick(l2), payments: p2 },
  ];

  const second = appId === "demo-loan-2";
  return {
    selected: second ? "demo-loan-2" : "demo-loan-1",
    loans,
    application: {
      ref_code: second ? "MP-2B91E0D4" : "MP-7F3A9C21",
      full_name: "Karthik N",
      phone: "9876543210",
      category: "Employed",
      requested_amount: second ? 30000 : 100000,
      created_at: iso(second ? 367 : 70),
      reviewed_at: iso(second ? 365 : 68),
      lender_name: "Example Finance Pvt Ltd",
      lender_reg_no: "N-14.03268",
      admin_note: "",
      contact_email: "karthik@example.com",
    },
    loan: second ? l2 : l1,
    payments: second ? p2 : p1,
    documents: second
      ? [
          { id: "demo-kfs-2", kind: "kfs", title: "Key Fact Statement", uploaded_at: iso(362) },
          { id: "demo-noc-2", kind: "noc", title: "No Objection Certificate", uploaded_at: iso(150) },
        ]
      : [
          { id: "demo-kfs", kind: "kfs", title: "Key Fact Statement", uploaded_at: iso(67) },
          { id: "demo-sanction", kind: "sanction_letter", title: "Sanction letter", uploaded_at: iso(67) },
          { id: "demo-agreement", kind: "agreement", title: "Loan agreement", uploaded_at: iso(66) },
        ],
    site: {
      lender_name: "Example Finance Pvt Ltd",
      lender_type: "NBFC",
      lender_reg_no: "N-14.03268",
      lender_website: "",
      support_email: "support@example.com",
      support_phone: "",
      grievance_officer: "Grievance Officer",
      grievance_email: "grievance@example.com",
      grievance_phone: "",
    },
    events: [
      { kind: "submitted", note: "Application submitted", created_at: iso(second ? 367 : 70) },
      { kind: "accepted", note: "", created_at: iso(second ? 365 : 68) },
      { kind: "loan_updated", note: "Loan details updated", created_at: iso(second ? 360 : 66) },
    ],
  };
}
