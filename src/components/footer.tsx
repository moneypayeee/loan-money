"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Mail, Phone, ShieldCheck } from "lucide-react";
import { Logo } from "./ui";
import { useSettings } from "@/lib/settings-context";
import { FEE } from "@/lib/types";

export function Footer() {
  const pathname = usePathname();
  const { site, payment } = useSettings();
  if (pathname.startsWith("/admin")) return null;

  const hasEmail = Boolean(site?.support_email && !/example\.com/i.test(site.support_email));
  const hasPhone = Boolean(site?.support_phone && !/90000\s*00000/.test(site.support_phone));
  const hasGrievance = Boolean(site?.grievance_officer && !/sample/i.test(site.grievance_officer));
  const hasAddress = Boolean(site?.company_address && !/sample/i.test(site.company_address));

  return (
    <footer className="relative mt-14 overflow-hidden border-t border-white/[0.06] bg-navy">
      <div className="aurora pointer-events-none absolute inset-x-0 bottom-0 h-[320px] opacity-50 [mask-image:linear-gradient(to_top,#000_40%,transparent)]" aria-hidden />
      <div className="divider-glow absolute inset-x-0 top-0" aria-hidden />

      <div className="shell relative grid grid-cols-2 items-start gap-x-6 gap-y-8 pb-8 pt-10 md:grid-cols-[1.5fr_1fr_1fr_1.2fr] md:gap-x-8 md:pt-11">
        <div className="col-span-2 md:col-span-1">
          <Logo />
          <p className="mt-3.5 max-w-xs text-sm leading-relaxed text-muted">
            MoneyPayee is a loan application broker platform. We verify your application; our banking &amp; lending partners manage every loan and credit decision.
          </p>
          <Link href="/apply" className="btn btn-gold btn-sm mt-4">
            Start your application <ArrowUpRight size={14} />
          </Link>
        </div>

        <FooterCol
          title="Platform"
          links={[
            ["/apply", "Apply"],
            ["/how-it-works", "How it works"],
            ["/questions", "FAQs"],
          ]}
        />

        <FooterCol
          title="Legal"
          links={[
            ["/terms", "Terms & Conditions"],
            ["/privacy", "Privacy policy"],
            ["/terms#grievance", "Grievance redressal"],
          ]}
        />

        <div className="col-span-2 md:col-span-1">
          <h3 className="text-[0.68rem] font-bold uppercase tracking-[0.2em] leading-none text-faint">Support</h3>
          <div className="mt-4 space-y-2.5 text-sm text-ink-2">
            <p className="text-xs leading-relaxed text-muted">Need help with your application, KYC, or fee verification?</p>
            {hasEmail && (
              <p>
                <a className="inline-flex items-center gap-2 text-xs hover:text-ink" href={`mailto:${site!.support_email}`}>
                  <Mail size={13} className="text-gold" /> {site!.support_email}
                </a>
              </p>
            )}
            {hasPhone && (
              <p className="inline-flex items-center gap-2 text-xs">
                <Phone size={13} className="text-gold" /> {site!.support_phone}
              </p>
            )}
            {hasGrievance && (
              <div className="well p-3 text-xs leading-relaxed">
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <ShieldCheck size={13} className="text-gold" /> Grievance officer
                </span>
                <span className="mt-1 block">{site!.grievance_officer}</span>
                {site!.grievance_email && !/example\.com/i.test(site!.grievance_email) && (
                  <a className="text-brand-ink hover:underline" href={`mailto:${site!.grievance_email}`}>
                    {site!.grievance_email}
                  </a>
                )}
              </div>
            )}
            {hasAddress && <p className="text-xs text-faint">{site!.company_address}</p>}
          </div>
        </div>
      </div>

      {/* Disclosures */}
      <div className="shell relative space-y-2 border-t border-white/[0.06] py-5 text-xs leading-relaxed text-faint">
        <p>
          <span className="text-muted">Application fee:</span> a one-time non-refundable application fee of ₹{payment?.fee ?? FEE} is charged for document and payment verification. The fee is not interest and is not deducted from any loan.
        </p>
        <p>
          <span className="text-muted">Lending partners:</span> loans are issued and managed by RBI-registered banks and NBFC partners. Loan amount, interest rate, tenure and all other terms are set by the lending partner and shown in a Key Fact Statement before you sign any loan agreement.
        </p>
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-white/[0.06]">
        <div className="shell flex flex-col items-start gap-2 py-4 text-xs text-faint sm:flex-row sm:items-center sm:justify-between lg:grid lg:grid-cols-3">
          <p>
            © {new Date().getFullYear()} {site?.company_name || "MoneyPayee"}. All rights reserved.
          </p>
          <p className="text-muted lg:text-center">
            Designed and developed by{" "}
            <a
              href="https://www.rakvih.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#f5c542] transition-[color,text-shadow] duration-300 hover:text-[#ffd970] hover:[text-shadow:0_0_8px_rgb(245_197_66/0.95),0_0_20px_rgb(245_197_66/0.65),0_0_36px_rgb(245_197_66/0.4)] focus-visible:[text-shadow:0_0_8px_rgb(245_197_66/0.95),0_0_20px_rgb(245_197_66/0.65)]"
            >
              Rakvih
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="text-[0.68rem] font-bold uppercase tracking-[0.2em] leading-none text-faint">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-ink-2 transition hover:text-ink">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
