"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Gift, IndianRupee, Share2, Sparkles, Users, Wallet } from "lucide-react";
import { ReferModal } from "./refer-modal";
import { DEFAULT_REFERRAL_CONFIG, fetchPublicReferralConfig, type ReferralConfig } from "@/lib/referral-system";

export function ReferralSection({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<ReferralConfig>(DEFAULT_REFERRAL_CONFIG);

  useEffect(() => {
    void fetchPublicReferralConfig().then(setCfg);
  }, []);

  return (
    <>
      <section className={`relative overflow-hidden py-14 sm:py-20 ${className}`}>
        <div className="shell">
          <div className="relative overflow-hidden rounded-[2rem] border border-gold/30 bg-gradient-to-br from-[#0b1f13] via-[#07150c] to-[#040c06] p-6 sm:p-10 lg:p-14 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
            <div className="aurora pointer-events-none absolute inset-0 opacity-30" aria-hidden />
            <div className="grid-lines pointer-events-none absolute inset-0 opacity-30" aria-hidden />

            <div className="relative z-10">
              {/* Header */}
              <div className="flex flex-col items-center text-center max-w-2xl mx-auto space-y-3">
                <span className="chip border-gold/40 bg-gold/15 text-xs font-bold uppercase tracking-wider text-gold flex items-center gap-1.5 px-3 py-1">
                  <Gift size={13} className="text-gold" /> Refer &amp; Earn Cash
                </span>
                <h2 className="display text-2xl sm:text-4xl lg:text-5xl font-bold text-ink">
                  Refer your friends, get <span className="text-champagne font-extrabold">{cfg.coins_per_referral.toLocaleString()} Coins</span> &amp; convert to real money
                </h2>
                <p className="text-sm sm:text-base text-ink-2 leading-relaxed">
                  Earn reward coins whenever your friends apply with your code. Convert your accumulated coins directly into real cash deposited straight into your personal UPI account!
                </p>
              </div>

              {/* 3 Step Process Grid */}
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    step: "01",
                    icon: Share2,
                    title: "Share your invite link",
                    desc: "Get your unique referral link or code and share it with friends and family on WhatsApp or social media.",
                  },
                  {
                    step: "02",
                    icon: Users,
                    title: "Friend applies & verifies",
                    desc: "Your friend completes their loan assistance application and submits their basic verification.",
                  },
                  {
                    step: "03",
                    icon: IndianRupee,
                    title: "Receive cash via UPI",
                    desc: `You get ${cfg.coins_per_referral.toLocaleString()} Coins in your wallet. Redeem them instantly for real cash sent directly to your UPI ID.`,
                  },
                ].map(({ step, icon: Icon, title, desc }) => (
                  <div
                    key={step}
                    className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 backdrop-blur transition-all duration-300 hover:border-gold/40 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-xl border border-gold/30 bg-gold/10 text-gold font-bold">
                        <Icon size={18} />
                      </span>
                      <span className="font-mono text-xs font-bold text-muted tracking-wider">STEP {step}</span>
                    </div>
                    <h3 className="mt-4 font-bold text-base text-ink">{title}</h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Action Banner */}
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/15 via-gold/10 to-transparent p-5 sm:p-6 backdrop-blur">
                <div className="flex items-center gap-3 text-center sm:text-left">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold shadow-lg shadow-gold/20">
                    <Sparkles size={22} />
                  </span>
                  <div>
                    <p className="text-sm sm:text-base font-bold text-ink">Ready to start earning reward cash?</p>
                    <p className="text-xs text-muted">Generate your referral link now and invite your network in seconds.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="btn btn-gold btn-lg w-full sm:w-auto shrink-0 justify-center font-bold text-sm shadow-xl shadow-gold/25"
                >
                  <Wallet size={16} /> Get My Referral Code <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ReferModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
