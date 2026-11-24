"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  BadgeIndianRupee,
  Bike,
  Laptop,
  Smartphone,
  Sprout,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  CarFront,
  Check,
  Clock3,
  FileLock2,
  Gift,
  GraduationCap,
  Landmark,
  Lock,
  Plus,
  RotateCcw,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { useSettings } from "@/lib/settings-context";
import { FEE } from "@/lib/types";
import { ReferralSection } from "./refer/referral-section";
import { ReferModal } from "./refer/refer-modal";

const MARQUEE = [
  { label: "Students", icon: GraduationCap },
  { label: "Delivery partners", icon: Bike },
  { label: "Drivers", icon: CarFront },
  { label: "Salaried professionals", icon: Briefcase },
  { label: "Shop owners", icon: Store },
  { label: "Freelancers", icon: Laptop },
  { label: "Gig workers", icon: Smartphone },
  { label: "Unemployed", icon: UserRound },
  { label: "First-time borrowers", icon: Sprout },
];

export function Landing() {
  const { site, disclosed, payment } = useSettings();
  const fee = payment?.fee !== undefined ? payment.fee : FEE;
  const [referOpen, setReferOpen] = useState(false);

  return (
    <main className="-mb-16 overflow-x-clip">
      {/* ============================== HERO ============================== */}
      <section className="relative">
        <div className="aurora pointer-events-none absolute inset-0 -top-40" aria-hidden />
        <div className="grid-lines pointer-events-none absolute inset-0 -top-40" aria-hidden />
        <div className="noise pointer-events-none absolute inset-0" aria-hidden />

        <div className="shell relative grid items-center gap-12 pb-14 pt-5 sm:pb-16 sm:pt-14 lg:pb-20 lg:pt-16 xl:grid-cols-[1.08fr_.92fr]">
          <div className="animate-rise">
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
              <button
                type="button"
                onClick={() => setReferOpen(true)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[0.68rem] font-semibold text-gold transition hover:border-gold/60 hover:bg-gold/20"
              >
                <Gift size={11} className="text-gold" />
                <span>Refer &amp; earn 1,000 Coins (Real Cash)</span>
                <ArrowRight size={10} className="transition group-hover:translate-x-0.5" />
              </button>
            </div>
            <div className="mt-4 sm:mt-5">
              <h1 className="display min-w-0 text-[2.05rem] leading-[1.06] min-[380px]:text-[2.25rem] sm:text-[3.5rem] md:text-[4rem] lg:text-[4.6rem] lg:leading-[1.03] xl:text-[4.6rem] 2xl:text-[5.1rem]">
                <span className="text-gradient">Credit for your</span>
                <br className="max-lg:hidden" />{" "}
                <span className="text-gradient">next chapter,</span>
                <br />
                <span className="serif text-champagne whitespace-nowrap text-[1.12em] leading-none">done right.</span>
              </h1>
            </div>
            <p className="mt-4 max-w-[34rem] text-[0.95rem] leading-relaxed text-ink-2 sm:mt-5 sm:text-lg">
              Apply in about five minutes. Get an instant loan in 48 hours through{" "}
              {disclosed ? <strong className="font-semibold text-ink">{site?.lender_name}</strong> : "our RBI-registered lending partner"}. One-time ₹{fee} verification fee.
              Transparent, fast and secure.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-8 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              <Link href="/apply" className="btn btn-gold btn-lg !px-3 sm:!px-6">
                <span className="sm:hidden">Apply now</span>
                <span className="hidden sm:inline">Start your application</span> <ArrowRight size={18} />
              </Link>
              <Link href="/how-it-works" className="btn btn-on-dark btn-lg !px-3 sm:!px-6">
                <span className="sm:hidden">How it works</span>
                <span className="hidden sm:inline">See how it works</span>
              </Link>
            </div>
            <div className="mt-6 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:mt-9">
              {[
                ["48h", "Instant loan"],
                [`₹${fee}`, "One-time fee"],
                ["100%", "Digital & secure"],
              ].map(([v, l]) => (
                <div key={l} className="bg-paper/85 px-2.5 py-3 backdrop-blur sm:px-4 sm:py-4">
                  <p className="display whitespace-nowrap text-[0.95rem] text-ink sm:text-xl">{v}</p>
                  <p className="mt-0.5 text-[0.6rem] font-medium leading-tight text-muted sm:text-[0.7rem]">{l}</p>
                </div>
              ))}
            </div>
          </div>

          <HeroBanner onReferClick={() => setReferOpen(true)} />
        </div>
      </section>

      {/* ============================ MARQUEE ============================= */}
      <section className="relative border-y border-white/[0.06] bg-white/[0.015] py-4" aria-label="Who can apply">
        <div className="mask-fade-x overflow-hidden">
          <div className="flex w-max animate-marquee whitespace-nowrap text-sm font-semibold text-muted">
            {[0, 1].map((k) => (
              <div key={k} className="flex shrink-0" aria-hidden={k === 1}>
                {MARQUEE.map(({ label, icon: Icon }) => (
                  <span key={label} className="flex items-center gap-8 pr-8">
                    <span className="flex items-center gap-2.5">
                      <span className="grid size-7 place-items-center rounded-lg border border-gold/20 bg-gold-soft/60 text-gold">
                        <Icon size={14} />
                      </span>
                      {label}
                    </span>
                    <span className="size-1 rounded-full bg-white/20" aria-hidden />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================= BENTO ============================== */}
      <section className="theme-light">
        <div className="shell py-14 sm:py-[4.5rem]">
          <SectionHead eyebrow="Why MoneyPayee" title="Everything a loan application should be." accent="And nothing it shouldn't." />
          <div className="mt-9 grid gap-4 md:grid-cols-6">
            <article className="card card-glow group overflow-hidden p-7 sm:p-9 md:col-span-4 md:row-span-2">
              <div className="flex h-full flex-col gap-8 lg:flex-row lg:items-center">
                <div className="flex-1">
                  <IconTile>
                    <ShieldCheck size={18} />
                  </IconTile>
                  <h3 className="display mt-5 text-3xl leading-tight sm:text-4xl">
                    <span className="text-gradient">Clear &amp; upfront.</span> <span className="serif text-champagne">Zero surprises.</span>
                  </h3>
                  <p className="mt-4 max-w-sm leading-relaxed text-muted">
                    A transparent one-time verification fee of ₹{fee} for processing your documents and identity. No hidden fees, no surprise charges, and nothing deducted from your loan.
                  </p>
                </div>
                <VerificationReceipt />
              </div>
            </article>

            <article className="card group p-7 md:col-span-2">
              <div className="flex items-start justify-between">
                <IconTile>
                  <Clock3 size={18} />
                </IconTile>
                <Ring />
              </div>
              <h3 className="display mt-5 text-xl">Instant loan in 48 hours</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">Real people review every application, with notes you can read.</p>
            </article>

            <article className="card group p-7 md:col-span-2">
              <div className="flex items-start justify-between">
                <IconTile>
                  <FileLock2 size={18} />
                </IconTile>
                <span className="chip border-line bg-paper font-mono text-ink-2">
                  <Lock size={11} className="text-gold" /> 04:59
                </span>
              </div>
              <h3 className="display mt-5 text-xl">Documents stay private</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">Private storage. Reviewer links expire after five minutes.</p>
            </article>

            <article className="card group p-7 md:col-span-3">
              <IconTile>
                <Landmark size={18} />
              </IconTile>
              <h3 className="display mt-5 text-xl">Regulated banking &amp; NBFC partners</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Every loan is issued and managed by RBI-registered banking and NBFC partners, with full terms disclosed upfront in a Key Fact Statement.
              </p>
            </article>

        <article className="card group p-7 md:col-span-3">
          <IconTile>
            <BadgeCheck size={18} />
          </IconTile>
          <h3 className="display mt-5 text-xl">One payment. Ever.</h3>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <li className="flex items-center gap-2 text-ink-2">
              <Check size={15} className="text-ok" /> ₹{fee} application fee
            </li>
            {["“Approval” fee", "“Insurance” fee", "“Release” fee"].map((t) => (
              <li key={t} className="flex items-center gap-2 text-faint line-through decoration-bad/60">
                <X size={15} className="text-bad" /> {t}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
      </section >

    {/* ========================== WHO CAN APPLY ========================== */}
    <section className="section-blue overflow-hidden">
      <div className="shell py-7 sm:py-10">
        <div className="relative overflow-hidden rounded-[1.5rem] border border-gold/35 bg-[#0a1a10] shadow-[0_30px_70px_-40px_rgb(0_0_0/0.8)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_20%,rgb(245_158_11/0.18),transparent_42%),linear-gradient(120deg,transparent_45%,rgb(22_163_74/0.22))]" aria-hidden />
          <div className="relative p-4 sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <p className="display text-xl font-black italic tracking-tight text-ink sm:text-3xl">MONEY <span className="text-[#f5c842]">PAYEE</span></p>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-gold sm:text-xs">Who can apply · Easy &amp; fast</span>
            </div>

            <div className="mt-4 grid gap-5 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:gap-7">
              <div>
                <p className="inline-flex items-center gap-2 rounded-md bg-emerald-500/20 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-emerald-300">
                  <Check size={15} strokeWidth={3} /> Easy loan applications for everyone
                </p>
                <h2 className="display mt-3 max-w-2xl text-3xl font-black uppercase leading-[0.98] tracking-tight text-ink sm:text-5xl">
                  Get your loan <span className="text-[#f5c842]">application</span>
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-2 sm:text-base">
                  Apply online in about five minutes with digital documents. No CIBIL score is requested on this form. The lending partner decides the final loan offer after review.
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    { icon: GraduationCap, title: "STUDENT", detail: "Student ID card, government ID & address proof" },
                    { icon: CarFront, title: "DRIVERS", detail: "Driving licence as ID, plus address proof" },
                    { icon: UserRound, title: "UNEMPLOYED", detail: "KYC: your ID and current address proof" },
                    { icon: Briefcase, title: "SALARIED & SELF-EMPLOYED", detail: "Government ID and address proof" },
                  ].map(({ icon: Icon, title, detail }) => (
                    <div key={title} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5 sm:px-3.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f5c842]/15 text-[#f5c842]"><Icon size={17} /></span>
                      <span><span className="block text-xs font-black tracking-wide text-ink sm:text-sm">{title}</span><span className="mt-0.5 block text-[0.68rem] leading-snug text-muted sm:text-xs">{detail}</span></span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-white/10 bg-[#050d08]/80 p-4 text-center sm:p-5">
                <span className="rounded-full border border-gold/35 bg-gold/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.17em] text-gold">Quick &amp; easy application</span>
                <div className="relative mt-3 grid size-32 place-items-center rounded-full border-[6px] border-emerald-500/90 bg-emerald-400/10 sm:size-36">
                  <div><Clock3 size={22} className="mx-auto text-emerald-300" /><p className="display mt-0.5 text-3xl font-black text-emerald-300 sm:text-4xl">5</p><p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-2">minutes</p></div>
                </div>
                <p className="mt-3 max-w-xs text-[0.7rem] leading-relaxed text-muted">To complete your application. Get your instant loan in 48 hours; the lending partner decides the final loan offer.</p>
                <div className="mt-4 grid w-full grid-cols-2 gap-1.5 text-left sm:grid-cols-3">
                  <div className="rounded-xl bg-white/[0.05] p-3"><FileLock2 size={17} className="text-gold" /><p className="mt-1 text-[0.68rem] font-bold uppercase leading-tight text-ink">No CIBIL score</p><p className="mt-1 text-[0.62rem] text-muted">No score entry on this form</p></div>
                  <div className="rounded-xl bg-white/[0.05] p-3"><FileCheck2 size={17} className="text-gold" /><p className="mt-1 text-[0.68rem] font-bold uppercase leading-tight text-ink">No paperwork</p><p className="mt-1 text-[0.62rem] text-muted">Apply online; upload documents</p></div>
                  <div className="rounded-xl bg-white/[0.05] p-3"><ShieldCheck size={17} className="text-gold" /><p className="mt-1 text-[0.68rem] font-bold uppercase leading-tight text-ink">Safe &amp; secure</p><p className="mt-1 text-[0.62rem] text-muted">Private document storage</p></div>
                  <div className="rounded-xl bg-white/[0.05] p-3"><BadgeIndianRupee size={17} className="text-gold" /><p className="mt-1 text-[0.68rem] font-bold uppercase leading-tight text-ink">High loan amount</p><p className="mt-1 text-[0.62rem] text-muted">Request up to ₹5,00,000</p></div>
                  <div className="rounded-xl bg-white/[0.05] p-3"><FileCheck2 size={17} className="text-gold" /><p className="mt-1 text-[0.68rem] font-bold uppercase leading-tight text-ink">Minimum documents</p><p className="mt-1 text-[0.62rem] text-muted">Requirements depend on category</p></div>
                  <div className="rounded-xl bg-white/[0.05] p-3"><Check size={17} className="text-gold" /><p className="mt-1 text-[0.68rem] font-bold uppercase leading-tight text-ink">Instant loan</p><p className="mt-1 text-[0.62rem] text-muted">In 48 hours; lender decides</p></div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col items-center justify-between gap-2 rounded-xl bg-[#f5c842] px-4 py-2.5 text-center sm:flex-row sm:px-5">
              <p className="text-[0.68rem] font-black uppercase tracking-wide text-[#171306] sm:text-xs">Apply now · Easy, fast &amp; hassle-free</p>
              <Link href="/apply" className="inline-flex items-center gap-2 rounded-full bg-[#07150c] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#102b1a]">
                Start your application <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ============================= PROCESS ============================ */ }
    < section className = "theme-light relative overflow-hidden" >
      <div className="shell relative py-14 sm:py-[4.5rem]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead eyebrow="The process" title="Four steps." accent="No surprises." />
          <Link href="/how-it-works" className="btn btn-outline">
            The full process <ArrowUpRight size={15} />
          </Link>
        </div>
        <ol className="relative mt-9 grid gap-0 md:grid-cols-4 md:gap-6">
          <span className="divider-glow absolute left-0 right-0 top-6 hidden md:block" aria-hidden />
          {[
            ["Fill in your details", "Personal details, address and loan amount. Takes 30 seconds."],
            ["Upload your documents", "ID, Aadhaar, PAN and address proof matched to your category."],
            [`Pay ₹${fee} by UPI`, "Pay via Razorpay or UPI QR, then add your UTR and screenshot."],
            ["Instant loan in 48 hours", "Our team verifies your documents and passes your file to the bank/lender."],
          ].map(([t, d], i) => (
            <li key={t} className="relative flex gap-4 pb-7 last:pb-0 md:block md:pb-0">
              {i < 3 && <span className="absolute bottom-0 left-6 top-12 w-px bg-gradient-to-b from-gold/40 to-brand/20 md:hidden" aria-hidden />}
              <span className="relative grid size-12 shrink-0 place-items-center rounded-full border border-gold/40 bg-paper font-display text-sm font-semibold text-gold shadow-[0_0_30px_-6px_rgb(227_194_125/0.6)]">
                0{i + 1}
              </span>
              <div className="pt-1.5 md:pt-0">
                <h3 className="display text-lg md:mt-4">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted md:mt-2">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      </section >

      {/* =============================== FEE =============================== */}
      <section className="section-blue overflow-hidden">
        <div className="shell py-14 sm:py-[4.5rem]">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <SectionHead eyebrow="The fee, explained" title="One fee." accent="100% transparent." />
              <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-ink-2 sm:text-lg">
                The ₹{fee} pays for real people to check your documents and payment. It is not interest, it is never taken from your loan, and it is the only payment
                we will ever ask you for.
              </p>
            </div>

            <div className="card card-glow overflow-hidden">
              <div className="p-6 sm:p-8">
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-muted">Fee breakdown</p>
                <p className="display mt-3 text-6xl">
                  <span className="text-champagne">₹{fee}</span>
                  <span className="ml-2 text-base font-medium text-muted">once</span>
                </p>
              </div>
              <div className="perforated h-5 border-y border-dashed border-white/10" aria-hidden />
              <dl className="divide-y divide-white/[0.06] text-sm">
                {[
                  ["Verification fee", "One-time non-refundable fee covering manual document and identity verification."],
                  ["If approved", "Your verified application goes straight to the RBI-regulated lender."],
                  ["Payment check", "We verify your UTR in our accounts before passing details to the lender."],
                  ["Loan interest & charges", "Set by the lender, shown in a Key Fact Statement before you sign."],
                ].map(([k, v]) => (
                  <div key={k} className="grid gap-1 px-6 py-3.5 sm:grid-cols-[170px_1fr] sm:gap-6 sm:px-8">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-faint">{k}</dt>
                    <dd className="text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ REFERRAL ============================= */}
      <ReferralSection />

      {/* ============================== FAQ ============================== */}
    < section className = "theme-light" >
      <div className="shell py-14 sm:py-[4.5rem]">
        <div className="mx-auto max-w-2xl text-center">
          <SectionHead eyebrow="Good to know" title="Clear answers," accent="up front." />
          <p className="mx-auto mt-3 max-w-lg text-sm sm:text-base text-muted">
            Frequently asked questions about loan applications, verification, document privacy, and the platform fee.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl divide-y divide-line rounded-2xl border border-line bg-paper/60 p-2 sm:p-5 backdrop-blur">
          {[
            ["Does approval mean I get a loan?", "Approval means your documents and payment are verified and your application is sent to the lender. The lender decides the final amount, interest rate and tenure, and shows you a Key Fact Statement before you sign."],
            ["Is the application fee refundable?", `The ₹${fee} fee covers operational and verification costs incurred to manually check your documents and payment.`],
            ["Who sees my documents?", "Only you and our authorised reviewers. Files sit in private storage, and review links expire after five minutes."],
            ["Can I apply again?", "Yes, once your current application has a decision. One application can be under review at a time."],
          ].map(([q, a]) => (
            <details key={q} className="group p-4 sm:p-5 transition hover:bg-white/[0.02]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base sm:text-[1.05rem] font-semibold text-ink">
                {q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition group-open:rotate-45 group-open:border-gold/40 group-open:text-gold">
                  <Plus size={16} />
                </span>
              </summary>
              <p className="mt-3 pr-10 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/questions" className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-ink">
            View all frequently asked questions <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>

    {/* =============================== CTA =============================== */}
    <section className="theme-light pb-14 sm:pb-[4.5rem]">
      <div className="shell">
        <div className="theme-dark section-blue card-glow relative overflow-hidden rounded-[var(--radius-card)] px-6 py-12 text-center shadow-[0_40px_80px_-40px_rgb(11_20_48/0.7)] sm:px-14 sm:py-16">
          <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
          <div className="grid-lines pointer-events-none absolute inset-0 opacity-70" aria-hidden />
          <div className="relative">
            <h2 className="display mx-auto max-w-3xl text-[2.1rem] leading-[1.05] sm:text-6xl">
              <span className="text-gradient">Ready when</span> <span className="serif text-champagne">you are.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-ink-2">Easy, fast and hassle-free to apply. Keep your ID, an address proof and any UPI app handy.</p>
            <ul className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-2.5 text-left sm:gap-3 lg:grid-cols-4">
              {[
                [BadgeIndianRupee, "Request up to", "₹5,00,000"],
                [FileCheck2, "Minimum", "documents"],
                [ShieldCheck, "Safe &", "secure"],
                [Clock3, "Instant loan in", "48 hours"],
              ].map(([Icon, a, b]) => {
                const I = Icon as typeof Clock3;
                return (
                  <li key={a as string} className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 backdrop-blur sm:gap-3 sm:px-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gradient-to-br from-gold/20 to-gold/[0.03] text-gold">
                      <I size={16} />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-[0.7rem] text-muted">{a as string}</span>
                      <span className="block whitespace-nowrap text-[0.82rem] font-semibold text-ink sm:text-sm">{b as string}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <Link href="/apply" className="btn btn-gold btn-lg mt-8">
              Apply now <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    </section>

    <ReferModal open={referOpen} onClose={() => setReferOpen(false)} />
  </main>
  );
}

/* ---------------------------------------------------------------- pieces */

function SectionHead({ eyebrow, title, accent }: { eyebrow: string; title: string; accent?: string }) {
  return (
    <div className="max-w-2xl">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="display mt-4 text-[2.1rem] leading-[1.06] sm:text-[2.9rem]">
        <span className="text-gradient">{title}</span>
        {accent && (
          <>
            {" "}
            <span className="serif text-champagne text-[1.08em]">{accent}</span>
          </>
        )}
      </h2>
    </div>
  );
}

function IconTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-11 place-items-center rounded-xl border border-gold/25 bg-gradient-to-br from-gold/20 to-gold/[0.02] text-gold shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]">
      {children}
    </span>
  );
}

function Ring() {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="size-14 -rotate-90" aria-hidden>
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.32} />
    </svg>
  );
}

function VerificationReceipt() {
  const { payment } = useSettings();
  const fee = payment?.fee !== undefined ? payment.fee : FEE;
  return (
    <div className="theme-dark relative mx-auto w-full max-w-[290px] shrink-0 rotate-[2deg] transition duration-500 group-hover:rotate-0">
      <div className="rounded-2xl border border-white/10 bg-[#0a160f] p-5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-faint">Verification</span>
          <span className="text-[0.68rem] font-semibold text-muted">MoneyPayee</span>
        </div>
        <p className="display mt-4 text-4xl text-ink">₹{fee}.00</p>
        <p className="mt-1 text-xs text-muted">Document review &amp; KYC</p>
        <div className="perforated -mx-5 my-5 h-4 border-y border-dashed border-white/10" aria-hidden />
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-faint">Status</dt>
            <dd className="text-ink-2">Payment verified</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-faint">Review</dt>
            <dd className="text-ink-2">Instant loan in 48 hours</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-faint">UTR</dt>
            <dd className="font-mono text-ink-2">UPI428192018291</dd>
          </div>
        </dl>
      </div>
      <span className="absolute -right-3 -top-3 rotate-[10deg] rounded-lg border-2 border-ok/70 bg-ok-soft px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-[0.18em] text-ok shadow-lg">
        Verified
      </span>
    </div>
  );
}

function HeroBanner({ onReferClick }: { onReferClick?: () => void }) {
  return (
    <figure className="relative mx-auto w-full max-w-[640px] animate-rise [animation-delay:150ms] xl:mr-0">
      <div className="absolute -inset-3 rounded-[2.75rem] bg-gradient-to-br from-gold/25 via-gold/5 to-brand/25 blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-gold/30 bg-[#f9c80e] shadow-[0_50px_100px_-35px_rgb(0_0_0/0.95)] sm:rounded-[2.25rem]">
        <Image
          src="/hero-banner.jpg"
          alt="A smiling young man holding rupee notes and giving a thumbs up"
          width={1672}
          height={941}
          priority
          sizes="(min-width: 1280px) 640px, (min-width: 640px) 90vw, 100vw"
          className="aspect-[16/11] w-full object-cover object-right xl:aspect-[5/4.4]"
        />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/20" aria-hidden />

        <div className="absolute left-3 top-3 max-w-[50%] sm:left-6 sm:top-6 xl:max-w-none xl:animate-float">
          <div className="flex h-full items-center gap-2 rounded-2xl border border-white/15 bg-[#07100a]/85 px-3 py-2.5 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ok text-paper sm:size-9">
              <Check size={15} strokeWidth={3} />
            </span>
            <span>
              <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted sm:text-[0.65rem]">Application approved</span>
              <span className="display block text-base leading-tight text-ink sm:text-xl">₹50,000</span>
            </span>
          </div>
        </div>

        <div className="absolute bottom-3 left-3 max-w-[50%] sm:bottom-6 sm:left-6 xl:bottom-auto xl:left-auto xl:right-6 xl:top-6 xl:max-w-none xl:animate-float xl:[animation-delay:1.2s]">
          <button
            type="button"
            onClick={onReferClick}
            className="group flex h-full w-full items-center gap-2 rounded-2xl border border-gold/30 bg-[#07100a]/90 px-2.5 py-2 text-left shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl transition hover:border-gold/60 hover:scale-[1.03] active:scale-[0.98] sm:gap-3 sm:px-4 sm:py-3 cursor-pointer"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-yellow-500 text-stone-950 font-bold sm:size-9 shadow-[0_0_15px_rgba(234,179,8,0.4)]">
              <Gift size={15} />
            </span>
            <span>
              <span className="block text-[0.6rem] font-bold uppercase tracking-[0.12em] text-gold sm:text-[0.65rem]">Refer &amp; Earn</span>
              <span className="display block text-xs font-bold leading-tight text-ink sm:text-base">
                1,000 Coins <span className="text-[0.62rem] text-champagne font-normal sm:text-xs">(Real Cash)</span>
              </span>
            </span>
          </button>
        </div>

      </div>

      <div className="relative mt-3 xl:absolute xl:bottom-6 xl:left-6 xl:mt-0">
        <div className="rounded-2xl border border-white/15 bg-[#07100a]/85 px-3 py-2.5 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:px-4 sm:py-3">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-ink sm:text-sm">
            <Clock3 size={14} className="text-gold" /> Instant loan in 48 hours
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[0.62rem] text-muted sm:text-xs">
            <ShieldCheck size={12} className="text-gold" /> 100% digital verification &amp; fast review
          </p>
        </div>
      </div>
    </figure>
  );
}
