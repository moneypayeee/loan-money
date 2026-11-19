/**
 * Fixed site details: lender disclosure, contacts and payment.
 *
 * This is the ONLY place to change these values (there is no admin Settings page).
 * After editing, copy them into the database, which uses them to accept applications:
 *
 *   npm run sync-settings
 *
 * Applications stay closed until lender_name and lender_reg_no are filled in, and
 * the fee can't be collected until payee_name, upi_id and the QR image are set.
 *
 * ⚠ PLACEHOLDER VALUES: everything below is sample data for testing. Replace ALL of it
 *   (and public/payment-qr.svg) with your real details before going live.
 */
import type { PaymentSettings, SiteSettings } from "../lib/types";

export const SITE: SiteSettings = {
  company_name: "MoneyPayee",
  company_address: "",

  // Broker platform: loans are issued by RBI-regulated banking and NBFC partners.
  lender_name: "RBI-Registered Banking & Lending Partners",
  lender_type: "NBFC", // "NBFC" | "Bank" | "Other RBI-regulated entity"
  lender_reg_no: "",
  lender_website: "",

  support_email: "support@moneypayee.in",
  support_phone: "",

  grievance_officer: "",
  grievance_email: "support@moneypayee.in",
  grievance_phone: "",

  // Standard review turnaround window (days).
  refund_days: 7,
};

export const PAYMENT: PaymentSettings = {
  payee_name: "MoneyPayee",
  upi_id: "",
  fee: 299,
  // QR image file inside public/.
  qr_path: "payment-qr.svg",
};

/**
 * EMI estimate shown on the application form (step 1) as people choose an amount.
 * Only an illustration: the lender sets the real rate, tenure and charges in the
 * Key Fact Statement. Set annual_rate to the lender's typical rate.
 */
export const LOAN_ESTIMATE = {
  annual_rate: 18, // % a year, reducing balance
  tenures: [3, 6, 9, 12, 18, 24], // months
};
