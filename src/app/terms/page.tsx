import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeIndianRupee,
  Building2,
  Check,
  Clock3,
  Download,
  Landmark,
  MessageSquareWarning,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionHead } from "@/components/section-head";
import { DisclosureCard } from "@/components/lender-disclosure";
import { GrievanceContact, LenderName } from "@/components/settings-text";
import { TermsDocumentViewer } from "@/components/terms-document-viewer";
import { TERMS_PDF_PATH } from "@/config/terms-data";

export const metadata: Metadata = {
  title: "Terms & Conditions — MoneyPayee",
  description:
    "Official Loan Application Assistance Terms & Conditions, the non-refundable verification fee policy, lender relationship and dispute redressal.",
};

export default function TermsPage() {
  return (
    <main className="-mb-16">
      <PageHeader
        eyebrow="Legal & Terms"
        title="Terms & Conditions."
        intro="Official Loan Application Assistance Agreement. Read through our 12 clauses below or download the signed legal PDF document."
      />

      {/* ======================= DOCUMENT VIEWER & CLAUSES ======================= */}
      <section className="theme-light bg-white text-ink">
        <div className="shell py-10 sm:py-14">
        {/* At a Glance Summary Strip */}
        <div className="mb-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Glance
            icon={<Building2 size={18} />}
            value="Platform Assistance"
            label={<>We assist &amp; verify; <LenderName fallback="the regulated lender" /> lends.</>}
          />
          <Glance
            icon={<BadgeIndianRupee size={18} />}
            value="₹299 One-Time"
            label="Service fee for manual document review."
          />
          <Glance
            icon={<ShieldCheck size={18} />}
            value="Non-Refundable"
            label="Once verification processing commences."
          />
          <Glance
            icon={<Clock3 size={18} />}
            value="48 Hours"
            label="Instant loan in 48 hours."
          />
        </div>

        {/* Interactive Document Viewer with Page 1 / Page 2 and Up/Down Arrows */}
        <TermsDocumentViewer />

        {/* ===================== GRIEVANCE & LENDER DETAILS ===================== */}
        <div id="grievance" className="mt-16 grid scroll-mt-36 items-start gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <SectionHead eyebrow="Grievance Redressal" title="Dispute resolution" accent="&amp; escalation." />
            <p className="mt-4 max-w-lg text-[0.98rem] leading-relaxed text-ink-2">
              In accordance with Clause 11 of the Terms &amp; Conditions, disputes are subject to the jurisdiction of competent courts in Bengaluru, Karnataka. For questions or concerns regarding application assistance, contact <GrievanceContact />.
            </p>
            <ol className="mt-8 space-y-4">
              {[
                [MessageSquareWarning, "Raise your inquiry or complaint", "Email our grievance officer with your application reference code and transaction UTR."],
                [Clock3, "Acknowledged in 2 working days", "Our compliance team will acknowledge receipt of your notice within 48 hours."],
                [Check, "Resolved within 30 days", "We strive to investigate and close every inquiry within 30 days."],
                [Landmark, "RBI Integrated Ombudsman", "For matters involving RBI-regulated lending partners, contact the RBI Integrated Ombudsman at cms.rbi.org.in."],
              ].map(([Icon, t, d], i, arr) => {
                const I = Icon as typeof Check;
                return (
                  <li key={t as string} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < arr.length - 1 && (
                      <span className="absolute bottom-0 left-5 top-11 w-px bg-gradient-to-b from-gold/50 to-gold/10" aria-hidden />
                    )}
                    <span className="relative grid size-10 shrink-0 place-items-center rounded-full border border-amber-500/30 bg-amber-50 text-amber-700 shadow-sm">
                      <I size={16} />
                    </span>
                    <div className="pt-1.5">
                      <p className="font-semibold text-ink">{t as string}</p>
                      <p className="mt-0.5 text-[0.92rem] leading-relaxed text-muted">{d as string}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="space-y-4 lg:sticky lg:top-32">
            <DisclosureCard />
            <div className="card p-6 border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <Download size={20} />
                </span>
                <div>
                  <p className="font-bold text-ink">Download PDF Copy</p>
                  <p className="text-xs text-muted">Original 2-page document</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Save an official PDF copy of the Loan Application Assistance Terms &amp; Conditions for your records.
              </p>
              <a
                href={TERMS_PDF_PATH}
                download="MoneyPay_Terms_and_Conditions.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-gold btn-sm mt-4 w-full justify-center font-bold"
              >
                <Download size={14} /> Download PDF
              </a>
              <Link href="/apply" className="btn btn-outline btn-sm mt-2 w-full justify-center">
                Start Loan Application <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
        </div>
      </section>
    </main>
  );
}

function Glance({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <div className="card p-4 sm:p-5 border border-slate-200 bg-white shadow-sm">
      <span className="grid size-10 place-items-center rounded-xl border border-amber-500/30 bg-amber-50 text-amber-700">
        {icon}
      </span>
      <p className="display mt-3 text-base sm:text-xl font-bold leading-tight text-ink">{value}</p>
      <p className="mt-1 text-[0.75rem] sm:text-xs leading-snug text-muted">{label}</p>
    </div>
  );
}
