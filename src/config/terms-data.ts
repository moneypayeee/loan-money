export type TermClause = {
  id: number;
  title: string;
  page: 1 | 2;
  body?: string;
  intro?: string;
  bullets?: string[];
  outro?: string;
  important?: boolean;
};

export const TERMS_DOCUMENT_TITLE = "MONEY PAY";
export const TERMS_DOCUMENT_SUBTITLE = "LOAN APPLICATION ASSISTANCE – TERMS & CONDITIONS";
export const TERMS_PDF_PATH = "/MoneyPay_Terms_and_Conditions.pdf";

export const TERMS_CLAUSES: TermClause[] = [
  // Page 1
  {
    id: 1,
    page: 1,
    title: "1. Application / Service Fee",
    body: "The applicant agrees to pay the applicable application assistance or service fee determined by MoneyPay for the selected services. The applicable fee may vary depending on the nature, scope and requirements of the services requested.\n\nThe exact fee shall be communicated and displayed to the applicant before payment. By proceeding with the payment, the applicant acknowledges and accepts the applicable fee.",
  },
  {
    id: 2,
    page: 1,
    title: "2. Non-Refundable Fee Policy",
    important: true,
    intro: "All application assistance and service fees are non-refundable once MoneyPay has commenced the agreed services or application processing.",
    body: "The applicant shall not be entitled to a refund merely because:",
    bullets: [
      "The loan application is rejected.",
      "The applicant does not meet the lender's eligibility criteria.",
      "The requested loan amount is not approved.",
      "The applicant decides to discontinue the application after processing has commenced.",
      "The lender delays the application or disbursement.",
      "The applicant fails to provide the required documents or information.",
    ],
    outro: "This policy is subject to applicable laws and statutory refund rights. If MoneyPay is unable to commence or provide the agreed services due to its own reasons, an appropriate refund shall be provided where legally required.",
  },
  {
    id: 3,
    page: 1,
    title: "3. No Guarantee of Loan Approval",
    important: true,
    body: "MoneyPay does not guarantee or promise loan approval, sanction, disbursement or any specific loan amount. Payment of the application or service fee does not mean that the applicant's loan will be approved.\n\nThe final decision regarding loan approval, eligibility, interest rates, loan amount and disbursement rests entirely with the respective bank, NBFC or authorised lending institution.",
  },
  {
    id: 4,
    page: 1,
    title: "4. Applicant Information and Documents",
    body: "The applicant is responsible for providing accurate, complete and genuine personal, financial, employment and supporting document information.\n\nMoneyPay shall not be responsible for incorrect, incomplete, misleading or fraudulent information submitted by the applicant.",
  },
  {
    id: 5,
    page: 1,
    title: "5. Loan Eligibility and Verification",
    body: "Loan approval is subject to the lender's internal policies, credit score, financial eligibility, document verification, repayment capacity and other applicable criteria. MoneyPay has no authority to override the lender's independent decision.",
  },
  {
    id: 6,
    page: 1,
    title: "6. Third-Party Decisions and Delays",
    body: "MoneyPay shall not be responsible for loan rejection, changes in lending policies, verification delays or other decisions independently made by banks, NBFCs or authorised lending institutions, provided MoneyPay has fulfilled its own contractual and legal obligations.",
  },
  {
    id: 7,
    page: 1,
    title: "7. Additional Charges",
    body: "Any additional service fees or third-party charges, where applicable, shall be clearly communicated to the applicant separately before payment. No undisclosed charges shall be imposed.",
  },

  // Page 2
  {
    id: 8,
    page: 2,
    title: "8. Privacy and Information Sharing",
    body: "The applicant consents to MoneyPay collecting and processing the information necessary to provide the requested services, in accordance with applicable data protection laws and the MoneyPay Privacy Policy. Information may be shared with relevant lending institutions where necessary and lawfully authorised.",
  },
  {
    id: 9,
    page: 2,
    title: "9. Cancellation of Application",
    body: "The applicant may request cancellation of the application through MoneyPay's official communication channels. If the agreed services have already commenced, the non-refundable fee policy under Clause 2 shall apply, subject to applicable law.",
  },
  {
    id: 10,
    page: 2,
    title: "10. Limitation of Liability",
    body: "MoneyPay shall not be liable for independent lending decisions, loan rejection or delays attributable to third-party lenders, provided MoneyPay has fulfilled its own contractual and legal obligations. Nothing in these Terms shall exclude liability for fraud, negligence, wilful misconduct, breach of applicable law or any liability that cannot legally be excluded.",
  },
  {
    id: 11,
    page: 2,
    title: "11. Governing Law and Jurisdiction",
    body: "These Terms and Conditions shall be governed by the laws of India. Subject to applicable consumer protection laws and statutory jurisdiction, disputes shall be subject to the jurisdiction of competent courts in Bengaluru, Karnataka.",
  },
  {
    id: 12,
    page: 2,
    title: "12. Applicant Acceptance and Declaration",
    important: true,
    intro: "By proceeding with the application and making payment, the applicant confirms and declares that:",
    bullets: [
      "I have read and understood all the Terms and Conditions.",
      "I voluntarily agree to pay the applicable service fee displayed or communicated to me before payment.",
      "I understand that the service fee is non-refundable once the agreed services have commenced, subject to applicable law.",
      "I clearly understand that MoneyPay does not guarantee loan approval, sanction or disbursement.",
      "I understand that the final loan decision rests solely with the respective lending institution.",
      "I confirm that all information and documents submitted by me are genuine and accurate.",
      "I accept these Terms and Conditions voluntarily and without any undue pressure.",
    ],
    outro: "Electronic Acceptance: By selecting the acceptance checkbox and proceeding with payment, the applicant acknowledges and agrees to these Terms and Conditions.",
  },
];
