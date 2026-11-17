"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Gift, Sparkles, Wallet } from "lucide-react";
import { ReferModal } from "./refer-modal";
import { DEFAULT_REFERRAL_CONFIG, fetchPublicReferralConfig, type ReferralConfig } from "@/lib/referral-system";

export function ReferPromoBanner({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<ReferralConfig>(DEFAULT_REFERRAL_CONFIG);

  useEffect(() => {
    void fetchPublicReferralConfig().then(setCfg);
  }, []);

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-r from-[#0d2214] via-[#07150c] to-[#040a06] p-5 sm:p-7 shadow-xl shadow-black/40 ${className}`}
      >
        <div className="aurora pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="chip border-gold/40 bg-gold/15 text-[0.68rem] font-bold uppercase tracking-wider text-gold flex items-center gap-1">
                <Gift size={12} /> Refer &amp; Earn
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <Sparkles size={12} /> Real Cash Payout
              </span>
            </div>
            <h3 className="display text-xl sm:text-2xl font-bold text-ink">
              Invite friends, get <span className="text-champagne font-extrabold">{cfg.coins_per_referral.toLocaleString()} Coins</span> &amp; convert to real money!
            </h3>
            <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
              Earn reward coins every time your friend applies. Convert your coins into real cash deposited straight into your UPI account.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn btn-gold btn-md font-bold shadow-lg shadow-gold/25"
            >
              <Wallet size={15} /> Refer &amp; Earn Cash <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <ReferModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function FloatingReferWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full border border-gold/40 bg-[#07160d]/95 px-4 py-2.5 text-xs font-bold text-gold shadow-xl shadow-black/60 backdrop-blur-md transition-all hover:scale-105 hover:border-gold hover:bg-[#0c2214]"
        aria-label="Refer Friends & Earn Cash"
      >
        <Gift size={16} className="text-gold animate-bounce" />
        <span>Refer &amp; Earn 1,000 Coins</span>
        <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-emerald-400 border border-emerald-500/30">
          ₹ Cash
        </span>
      </button>

      <ReferModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
