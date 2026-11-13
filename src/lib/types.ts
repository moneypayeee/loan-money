export type ApplicationStatus = "pending" | "accepted" | "rejected";
export type RefundStatus = "not_applicable" | "pending" | "refunded";
export type EventKind =
  | "submitted"
  | "accepted"
  | "rejected"
  | "refund_due"
  | "no_refund"
  | "refunded"
  | "kyc_verified"
  | "kyc_problem"
  | "kyc_resubmit"
  | "kyc_resubmitted";

export type KycStatus = "pending" | "verified" | "problem" | "resubmit";
export type KycDocKey = "identity" | "identity_back" | "address" | "student";

export type SiteSettings = {
  lender_name: string;
  lender_type: "NBFC" | "Bank" | "Other RBI-regulated entity";
  lender_reg_no: string;
  lender_website: string;
  company_name: string;
  company_address: string;
  support_email: string;
  support_phone: string;
  grievance_officer: string;
  grievance_email: string;
  grievance_phone: string;
  refund_days: number;
};

export type PaymentSettings = {
  qr_path: string | null;
  payee_name: string;
  upi_id: string;
  fee: number;
};

export type Application = {
  id: string;
  ref_code: string | null;
  user_id: string;
  full_name: string;
  phone: string;
  category: string;
  requested_amount: number;
  transaction_id: string;
  proof_path: string;
  fee: number;
  payee_name: string;
  upi_id: string;
  status: ApplicationStatus;
  payment_verified: boolean;
  kyc_verified: boolean;
  admin_note: string;
  reviewed_at: string | null;
  created_at: string;
  refund_upi_id: string | null;
  refund_status: RefundStatus;
  refund_reference: string | null;
  refunded_at: string | null;
  lender_name: string | null;
  lender_reg_no: string | null;
  contact_email: string | null;
  kyc_status: KycStatus;
  /** Reviewer's note: the problem found, or what to fix when re-uploading (the applicant sees it). */
  kyc_note: string;
  kyc_requested_docs: KycDocKey[];
  kyc_reviewed_at: string | null;
};

export type ApplicationEvent = {
  id: number;
  application_id: string;
  kind: EventKind;
  note: string;
  created_at: string;
};

export type Kyc = {
  dob: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  identity_type: string;
  identity_last4: string;
  institution: string | null;
  identity_path: string;
  identity_back_path: string | null;
  address_path: string;
  student_path: string | null;
  consent_at: string;
};

export type DashboardStats = {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  overdue: number;
  refunds_pending: number;
  refunds_pending_amount: number;
  refunded_amount: number;
  fees_retained: number;
  accepted_volume: number;
  avg_review_hours: number | null;
  daily: { day: string; count: number }[];
};

export const APPLICATION_COLUMNS =
  "id,ref_code,user_id,full_name,phone,category,requested_amount,transaction_id,proof_path,fee,payee_name,upi_id,status,payment_verified,kyc_verified,admin_note,reviewed_at,created_at,refund_upi_id,refund_status,refund_reference,refunded_at,lender_name,lender_reg_no,contact_email,kyc_status,kyc_note,kyc_requested_docs,kyc_reviewed_at";

export const FEE = 299;
export const CATEGORIES = ["Student", "Driver", "Employed", "Self-employed", "Unemployed"] as const;
export const IDENTITY_TYPES = ["Voter ID", "Passport", "Driving licence"] as const;

export type LoanStatus = "sanctioned" | "disbursed" | "active" | "closed";

export type Loan = {
  application_id: string;
  loan_account_no: string;
  sanctioned_amount: number | null;
  interest_rate: number | null;
  tenure_months: number | null;
  emi_amount: number | null;
  first_emi_date: string | null;
  disbursed_on: string | null;
  status: LoanStatus;
  note: string;
  updated_at: string;
  disbursed_amount: number | null;
  disbursed_to: string;
  processing_fee: number | null;
  apr: number | null;
  late_fee: string;
  prepayment_terms: string;
  repayment_method: RepaymentMethod;
  repayment_details: string;
  repayment_link: string;
};

export type RepaymentMethod = "" | "auto_debit" | "lender_link" | "bank_transfer" | "other";
export const REPAYMENT_METHODS: Record<Exclude<RepaymentMethod, "">, string> = {
  auto_debit: "Auto-debit (NACH / e-mandate)",
  lender_link: "Lender's payment link",
  bank_transfer: "Bank transfer to the lender",
  other: "Other (see instructions)",
};

export type LoanPayment = { instalment_no: number; paid_on: string; amount: number; reference: string };

export type LoanDocumentKind = "kfs" | "sanction_letter" | "agreement" | "noc" | "other";
export const DOCUMENT_KINDS: Record<LoanDocumentKind, string> = {
  kfs: "Key Fact Statement",
  sanction_letter: "Sanction letter",
  agreement: "Loan agreement",
  noc: "No Objection Certificate (NOC)",
  other: "Other document",
};
export type LoanDocument = { id: string; kind: LoanDocumentKind; title: string; uploaded_at: string; path?: string };

export type BorrowerAccess = { application_id: string; issued_at: string; last_login_at: string | null; locked_until: string | null };

/** One loan in the borrower's "My loans" list. */
export type BorrowerLoanSummary = {
  application_id: string;
  ref_code: string;
  requested_amount: number;
  reviewed_at: string | null;
  lender_name: string | null;
  loan: Pick<Loan, "loan_account_no" | "sanctioned_amount" | "interest_rate" | "tenure_months" | "emi_amount" | "first_emi_date" | "status"> | null;
  payments: LoanPayment[];
};

export type BorrowerPortalData = {
  /** Application id of the loan shown in detail. */
  selected: string;
  /** Every approved loan on this mobile number, newest first. */
  loans: BorrowerLoanSummary[];
  application: {
    ref_code: string;
    full_name: string;
    phone: string;
    category: string;
    requested_amount: number;
    created_at: string;
    reviewed_at: string | null;
    lender_name: string | null;
    lender_reg_no: string | null;
    admin_note: string;
    contact_email: string | null;
  };
  loan: Omit<Loan, "application_id"> | null;
  payments: LoanPayment[];
  documents: LoanDocument[];
  site: Pick<
    SiteSettings,
    "lender_name" | "lender_type" | "lender_reg_no" | "lender_website" | "support_email" | "support_phone" | "grievance_officer" | "grievance_email" | "grievance_phone"
  > | null;
  events: { kind: string; note: string; created_at: string }[];
};

/** One loan payment row as the admin console loads it (all loans at once). */
export type AdminLoanPayment = LoanPayment & { application_id: string };

/** Admin activity log entry (admin_activity RPC). */
export type ActivityEntry = {
  id: number;
  application_id: string;
  kind: string;
  note: string;
  created_at: string;
  full_name: string;
  ref_code: string | null;
  actor: "admin" | "applicant" | "system";
  actor_label: string;
};

/** Admin team member (admin_list_admins RPC). */
export type AdminMember = { user_id: string; email: string; created_at: string; last_sign_in_at: string | null; is_me: boolean };
