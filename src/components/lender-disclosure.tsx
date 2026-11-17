"use client";

import { BadgeIndianRupee, Building2, Clock3, FileLock2, Gift, ShieldCheck } from "lucide-react";
import { useSettings } from "@/lib/settings-context";
import { FEE } from "@/lib/types";

/**
 * Thin ticker above the navigation on every public page. It scrolls slowly
 * (pauses on hover, and stays still for people who turn off motion) and is
 * pinned to the top of the screen together with the header.
 */
export function DisclosureBar() {
  const { site, disclosed, loading } = useSettings();
  if (loading) return <div className="h-8 border-b border-white/[0.06] bg-[#050a07] sm:h-9" />;

  const items: { icon: typeof ShieldCheck; text: React.ReactNode }[] = [
    {
      icon: ShieldCheck,
      text: (
        <>
          Loans are issued &amp; managed by <strong className="font-semibold text-ink">RBI-registered banking &amp; lending partners</strong>
        </>
      ),
    },
    { icon: BadgeIndianRupee, text: <>One-time ₹{FEE} application fee · no hidden charges</> },
    { icon: Gift, text: <>Refer friends, get 1,000 Coins &amp; convert to real money in your UPI!</> },
    { icon: ShieldCheck, text: <>100% digital & secure document verification</> },
    { icon: Clock3, text: "Instant loan in 48 hours" },
    { icon: FileLock2, text: "Your documents are stored privately" },
  ];

  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map(({ icon: Icon, text }, i) => (
        <span key={i} className="flex items-center gap-2 whitespace-nowrap pr-10">
          <Icon size={13} className="shrink-0 text-gold" />
          <span>{text}</span>
          <span className="ml-8 size-1 rounded-full bg-white/20" aria-hidden />
        </span>
      ))}
    </div>
  );

  return (
    <div className="group relative border-b border-white/[0.06] bg-[#050a07]/95 text-[0.72rem] text-ink-2 backdrop-blur-xl">
      <div className="mask-fade-x flex h-8 items-center overflow-hidden sm:h-9">
        <div className="flex w-max animate-ticker group-hover:[animation-play-state:paused]">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

/** Full disclosure block used on the landing, apply and legal pages. */
export function DisclosureCard({ className = "" }: { className?: string }) {
  const { site } = useSettings();
  return (
    <div className={`card card-glow p-6 sm:p-7 ${className}`}>
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold-soft text-gold">
          <Building2 size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-muted">Lending partners</p>
          <p className="mt-1 text-base font-bold text-ink">RBI-Registered Banking &amp; NBFC Partners</p>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Broker platform" value={site?.company_name || "MoneyPayee"} />
            <Row label="Loan management" value="Managed directly by partner banks & NBFCs" />
          </dl>
          <p className="mt-4 border-t hairline pt-4 text-xs leading-relaxed text-muted">
            MoneyPayee verifies your documents and forwards your application to our lending partners. Final loan amount, interest rate, and repayment terms are shared in a Key Fact Statement before you sign.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-right font-semibold text-ink-2 sm:text-left ${mono ? "font-mono text-[0.82rem]" : ""}`}>{value}</dd>
    </div>
  );
}
