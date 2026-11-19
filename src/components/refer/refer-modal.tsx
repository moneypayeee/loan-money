"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  Coins,
  Copy,
  Gift,
  Landmark,
  Loader2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  coinsToRupees,
  DEFAULT_REFERRAL_CONFIG,
  fetchPublicReferralConfig,
  generateShareUrl,
  getMyReferralPortal,
  type PayoutRequest,
  type ReferralConfig,
  type ReferralItem,
} from "@/lib/referral-system";
import { useSession } from "@/lib/use-session";
import { rupees } from "@/lib/format";

export function ReferModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, ready } = useSession();
  const [cfg, setCfg] = useState<ReferralConfig>(DEFAULT_REFERRAL_CONFIG);
  const [refCode, setRefCode] = useState("");
  const [userCoins, setUserCoins] = useState(0);
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadPortal = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    if (!user) {
      const publicCfg = await fetchPublicReferralConfig();
      setCfg(publicCfg);
      setLoading(false);
      return;
    }

    const res = await getMyReferralPortal();
    if (res.error || !res.data) {
      setLoadError(res.error || "Could not load referral wallet.");
    } else {
      setCfg(res.data.config || DEFAULT_REFERRAL_CONFIG);
      setRefCode(res.data.wallet.referral_code);
      setUserCoins(res.data.wallet.coins_balance);
      setReferrals(res.data.referrals || []);
      setPayouts(res.data.payouts || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (open && ready) {
      void loadPortal();
    }
  }, [open, ready, loadPortal]);

  // Lock scroll
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const shareUrl = refCode ? generateShareUrl(refCode) : "";
  const cashValue = coinsToRupees(userCoins, cfg.rupees_per_1000_coins);

  const handleCopyCode = () => {
    if (!refCode) return;
    void navigator.clipboard.writeText(refCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex flex-col w-full max-w-xl max-h-[92vh] rounded-2xl border border-gold/30 bg-[#061209] text-ink shadow-2xl shadow-black/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b hairline bg-gradient-to-r from-gold/15 via-emerald-500/10 to-transparent px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl border border-gold/40 bg-gold/20 text-gold shadow-sm">
              <Gift size={18} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="chip border-gold/40 bg-gold/15 text-[0.65rem] font-bold uppercase tracking-wider text-gold">
                  Rewards Program
                </span>
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <Sparkles size={11} /> Bank Payouts by Admin
                </span>
              </div>
              <h2 className="display text-base sm:text-lg font-bold mt-0.5 text-ink">
                Refer Friends &amp; Earn {cfg.coins_per_referral.toLocaleString()} Coins
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 space-y-5 text-sm">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              <Loader2 size={18} className="animate-spin text-gold" />
              <span>Loading your referral summary…</span>
            </div>
          ) : !user ? (
            <div className="rounded-2xl border border-gold/30 bg-white/[0.02] p-6 text-center space-y-4">
              <p className="text-base font-bold text-ink">Apply first to get your referral code</p>
              <p className="text-xs text-muted leading-relaxed">
                Once you submit your loan application, your personal referral code is generated automatically. Share it with friends and our team will credit your bank account for verified referrals.
              </p>
              <Link
                href="/apply"
                onClick={onClose}
                className="btn btn-gold btn-md inline-flex items-center gap-2 font-bold"
              >
                Start Loan Application
              </Link>
            </div>
          ) : (
            <>
              {loadError && (
                <div className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-xs text-bad">
                  {loadError}
                </div>
              )}

              {/* Coin Wallet Card */}
              <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-[#0e2213] via-[#08170e] to-[#040c06] p-5 shadow-lg space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-[0.7rem] font-bold uppercase tracking-wider text-gold flex items-center gap-1.5">
                      <Coins size={14} /> My Referral Coins
                    </p>
                    <p className="display mt-1 text-3xl sm:text-4xl font-extrabold text-ink">
                      {userCoins.toLocaleString("en-IN")}{" "}
                      <span className="text-sm font-normal text-gold">Coins</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Estimated Value: <strong className="text-ok text-sm">{rupees(cashValue)}</strong>{" "}
                      <span className="text-[0.7rem] text-muted font-mono">
                        ({cfg.coins_per_referral} Coins = {rupees(coinsToRupees(cfg.coins_per_referral, cfg.rupees_per_1000_coins))})
                      </span>
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted flex items-center justify-center gap-1">
                      <Users size={12} /> Friends Referred
                    </p>
                    <p className="display mt-0.5 text-2xl font-extrabold text-gold">{referrals.length}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-ink-2">
                  <Landmark size={15} className="shrink-0 mt-0.5 text-emerald-400" />
                  <span>
                    Referral payouts are reviewed and transferred directly to your bank account by the admin team.
                  </span>
                </div>
              </div>

              {/* Referral Code & Link Box */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted">Your Personal Referral Code</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-gold/30 bg-black/40 px-3.5 py-2.5">
                    <span className="font-mono text-base font-bold text-gold tracking-wider">
                      {refCode || "—"}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 btn btn-ghost btn-xs text-xs font-semibold text-gold hover:text-white"
                    >
                      {copiedCode ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
                      <span>{copiedCode ? "Copied!" : "Copy Code"}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted">Your Direct Invite Link</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5">
                    <span className="font-mono text-xs text-ink-2 truncate max-w-[240px] sm:max-w-xs">
                      {shareUrl || "—"}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex items-center gap-1.5 btn btn-ghost btn-xs text-xs font-semibold text-muted hover:text-white"
                    >
                      {copiedLink ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
                      <span>{copiedLink ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {payouts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Bank Payout History</p>
                  <div className="divide-y divide-line rounded-xl border border-white/10 bg-white/[0.02]">
                    {payouts.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                        <div>
                          <span className="font-semibold text-ink">{rupees(p.amount_rupees)}</span>
                          {p.payout_utr && <span className="ml-2 font-mono text-muted">UTR: {p.payout_utr}</span>}
                        </div>
                        <span
                          className={`font-semibold uppercase text-[0.68rem] ${
                            p.status === "paid" ? "text-ok" : p.status === "declined" ? "text-bad" : "text-gold"
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* How It Works Steps */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              How it works
            </p>
            <div className="grid gap-2.5 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1">
                <span className="font-mono font-bold text-gold text-sm">01</span>
                <p className="font-semibold text-ink">Share with friends</p>
                <p className="text-muted text-[0.72rem] leading-relaxed">
                  Send your link or code via WhatsApp, SMS, or social media.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1">
                <span className="font-mono font-bold text-gold text-sm">02</span>
                <p className="font-semibold text-ink">Friend verifies</p>
                <p className="text-muted text-[0.72rem] leading-relaxed">
                  When your friend submits their application &amp; gets verified.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1">
                <span className="font-mono font-bold text-gold text-sm">03</span>
                <p className="font-semibold text-ink">Bank payout by admin</p>
                <p className="text-muted text-[0.72rem] leading-relaxed">
                  Our team tracks your count and transfers rewards directly to your bank account.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t hairline bg-white/[0.02] px-5 py-3.5 sm:px-6 flex items-center justify-between text-xs text-muted">
          <span>No limit on friends you can refer.</span>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-xs text-xs text-ink">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
