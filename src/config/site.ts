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
  company_name: "Money Pay",
  company_address: "123 Sample Street, Bengaluru, Karnataka 560001",

  // The RBI-regulated lender that issues the loans (shown on every page).
  lender_name: "Sample Finance Pvt Ltd",
  lender_type: "NBFC", // "NBFC" | "Bank" | "Other RBI-regulated entity"
  lender_reg_no: "N-00.00000",
  lender_website: "https://www.example.com",

  support_email: "support@example.com",
  support_phone: "+91 90000 00000",

  grievance_officer: "Sample Grievance Officer",
  grievance_email: "grievance@example.com",
  grievance_phone: "+91 90000 00001",

  // Days within which a declined applicant's ₹299 is refunded (1–30).
  refund_days: 7,
};

export const PAYMENT: PaymentSettings = {
  payee_name: "Sample Payee",
  upi_id: "sample@upi",
  fee: 299,
  // QR image file inside public/. When you add your real QR, give it a new name
  // (e.g. payment-qr.png) and update this path, so browsers don't show the old one.
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
