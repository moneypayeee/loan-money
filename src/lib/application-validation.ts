import { validateKycDetails } from "./kyc-validation.ts";

export type ApplicationInput = {
  full_name: string;
  phone: string;
  alt_phone?: string;
  email?: string;
  dob: string;
  category: string;
  requested_amount: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  identity_type: string;
  identity_last4: string;
  institution: string;
  kyc_consent: boolean;
  transaction_id: string;
  refund_upi_id: string;
  payment_consent: boolean;
  files: {
    identity: boolean;
    identity_back?: boolean;
    driving_licence?: boolean;
    aadhaar?: boolean;
    aadhaar_back?: boolean;
    pan?: boolean;
    address?: boolean;
    student?: boolean;
    proof: boolean;
  };
};

export type Errors = Record<string, string>;

export const UPI_RE = /^[A-Za-z0-9._-]{2,128}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export const STEP_FIELDS: string[][] = [
  ["full_name", "phone", "alt_phone", "email", "dob", "category", "requested_amount", "address", "city", "state", "pincode"],
  ["identity_type", "identity_last4", "identity_file", "identity_back", "driving_licence", "aadhaar_file", "aadhaar_back_file", "pan_file", "address_file", "institution", "student_file", "kyc_consent"],
  ["transaction_id", "proof", "refund_upi_id", "payment_consent"],
];

/** Mirrors the checks in submit_loan_application so users see errors before upload. */
export function validateApplication(v: ApplicationInput, today = new Date()): Errors {
  const e: Errors = {};
  if (v.full_name.trim().length < 2 || v.full_name.trim().length > 100) e.full_name = "Enter your full name as on your ID.";
  if (!/^[6-9]\d{9}$/.test(v.phone.trim())) e.phone = "Enter a valid 10-digit Indian mobile number.";
  if (v.alt_phone && v.alt_phone.trim()) {
    if (!/^[6-9]\d{9}$/.test(v.alt_phone.trim())) e.alt_phone = "Enter a valid 10-digit Indian mobile number.";
    else if (v.alt_phone.trim() === v.phone.trim()) e.alt_phone = "Alternative number cannot be the same as primary number.";
  }
  if (v.email !== undefined && (!v.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()))) {
    e.email = "Enter a valid email ID.";
  }
  if (!v.dob) e.dob = "Date of birth is required.";
  else {
    try {
      validateKycDetails({ dob: v.dob, category: v.category, identity_type: v.identity_type, institution: v.institution }, today);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/licence/.test(msg)) e.identity_type = msg;
      else if (/institution/.test(msg)) e.institution = msg;
      else e.dob = msg;
    }
  }
  const amount = Number(v.requested_amount);
  if (!Number.isInteger(amount) || amount < 1000 || amount > 500000) e.requested_amount = "Choose an amount between ₹1,000 and ₹5,00,000.";
  if (v.address.trim().length < 10) e.address = "Enter your full residential address.";
  if (v.city.trim().length < 2) e.city = "City is required.";
  if (v.state.trim().length < 2) e.state = "State is required.";
  if (!/^[1-9]\d{5}$/.test(v.pincode.trim())) e.pincode = "Enter a valid 6-digit PIN code.";

  if (v.identity_last4.trim() && !/^[A-Za-z0-9]{4}$/.test(v.identity_last4.trim())) {
    e.identity_last4 = "Enter 4 characters or leave blank.";
  }
  if (!v.files.aadhaar && !v.files.address) e.aadhaar_file = "Upload your Aadhaar card (front).";
  if (v.files.pan === false) e.pan_file = "Upload your PAN card.";
  if (v.category === "Driver" && v.files.driving_licence === false) e.driving_licence = "Drivers must upload their driving licence.";
  if (v.category === "Student") {
    if (v.institution.trim().length < 2) e.institution = "Enter your institution name.";
    if (!v.files.student) e.student_file = "Upload your student ID card.";
  }
  if (!v.kyc_consent) e.kyc_consent = "Please confirm and consent to the document review.";

  if (!/^[A-Za-z0-9_]{6,40}$/.test(v.transaction_id.trim())) e.transaction_id = "Enter the 6–40 character UTR or payment ID.";
  if (!v.files.proof) e.proof = "Upload your payment screenshot.";
  if (!UPI_RE.test(v.refund_upi_id.trim())) e.refund_upi_id = "Enter a valid UPI ID, e.g. name@okaxis.";
  if (!v.payment_consent) e.payment_consent = "Please confirm you have read the fee terms.";
  return e;
}

export function firstStepWithError(errors: Errors) {
  const idx = STEP_FIELDS.findIndex((fields) => fields.some((f) => errors[f]));
  return idx === -1 ? null : idx;
}
