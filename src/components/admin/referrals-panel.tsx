"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Landmark,
  Loader2,
  Save,
  Search,
  Send,
  Sliders,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  adminGetReferralsDashboard,
  adminPayReferrals,
  adminProcessPayout,
  adminUpdateReferralConfig,
  coinsToRupees,
  DEFAULT_REFERRAL_CONFIG,
  type PayoutRequest,
  type ReferralConfig,
  type ReferralItem,
  type ReferrerSummary,
} from "@/lib/referral-system";
import { dateOnly, dateTime, rupees, timeAgo } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { formatPhone } from "@/lib/phone-auth";
import type { AdminCtx } from "./admin-console";
import { Empty, Pill, Stat } from "./kit";

export function ReferralsPanel({ ctx }: { ctx: AdminCtx }) {
  const [cfg, setCfg] = useState<ReferralConfig>(DEFAULT_REFERRAL_CONFIG);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [wallets, setWallets] = useState<ReferrerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "declined">("all");
  const [search, setSearch] = useState("");
  const [payingItem, setPayingItem] = useState<PayoutRequest | null>(null);
  const [utrInput, setUtrInput] = useState("");

  // Referrals by member: expand a member, tick approved unpaid referrals, pay them together
  const [memberSearch, setMemberSearch] = useState("");
  const [onlyWithReferrals, setOnlyWithReferrals] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payTarget, setPayTarget] = useState<{ member: ReferrerSummary; ids: string[]; coins: number } | null>(null);
  const [payUtr, setPayUtr] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);

  // ctx is a new object on every console render, so it must NOT be a dependency here:
  // that made this panel refetch (and re-render the console) in an endless loop.
  const toastRef = useRef(ctx.toast);
  toastRef.current = ctx.toast;

  // The spinner shows only on first load; later refreshes update the numbers quietly.
  const loadDashboard = useCallback(async () => {
    const res = await adminGetReferralsDashboard();
    if (res.error) {
      toastRef.current("bad", res.error);
    } else if (res.data) {
      setCfg(res.data.config || DEFAULT_REFERRAL_CONFIG);
      setPayouts(res.data.payouts || []);
      setReferrals(res.data.referrals || []);
      setWallets(res.data.wallets || []);
    }
    setLoading(false);
  }, []);

  // Load on open, and again whenever the console's application list refreshes
  // (e.g. after an approval, so newly earned coins appear).
  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, ctx.apps]);

  const pendingPayouts = useMemo(() => payouts.filter((p) => p.status === "pending"), [payouts]);
  const paidPayouts = useMemo(() => payouts.filter((p) => p.status === "paid"), [payouts]);

  const totalPaidRupees = useMemo(() => paidPayouts.reduce((s, p) => s + p.amount_rupees, 0), [paidPayouts]);
  const pendingRupees = useMemo(() => pendingPayouts.reduce((s, p) => s + p.amount_rupees, 0), [pendingPayouts]);
  const approvedReferrals = useMemo(() => referrals.filter((r) => r.status === "completed"), [referrals]);
  const unpaidCoinsTotal = useMemo(() => approvedReferrals.filter((r) => !r.paid_at).reduce((s, r) => s + r.coins_awarded, 0), [approvedReferrals]);

  const byMember = useMemo(() => {
    const m = new Map<string, ReferralItem[]>();
    for (const r of referrals) m.set(r.referrer_user_id, [...(m.get(r.referrer_user_id) ?? []), r]);
    return m;
  }, [referrals]);

  const visibleMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return wallets
      .filter((w) => !onlyWithReferrals || w.referral_count > 0)
      .filter(
        (w) =>
          !q ||
          w.name.toLowerCase().includes(q) ||
          w.referral_code.toLowerCase().includes(q) ||
          (digits.length >= 3 && w.phone.includes(digits))
      );
  }, [wallets, memberSearch, onlyWithReferrals]);

  const filteredPayouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payouts
      .filter((p) => (filter === "all" ? true : p.status === filter))
      .filter((p) => !q || p.user_name.toLowerCase().includes(q) || p.user_phone.includes(q) || (p.upi_id || "").toLowerCase().includes(q));
  }, [payouts, filter, search]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCfg(true);
    const res = await adminUpdateReferralConfig(cfg);
    setSavingCfg(false);
    if (res.error) {
      ctx.toast("bad", res.error);
    } else {
      ctx.toast("ok", "Referral & Coin configuration saved to Supabase!");
    }
  };

  const handlePayReferrals = async () => {
    if (!payTarget) return;
    if (payUtr.trim().length < 4) {
      ctx.toast("bad", "Enter the bank / UPI transfer UTR or reference number.");
      return;
    }
    setPaying(true);
    const res = await adminPayReferrals(payTarget.ids, payUtr, payNote);
    setPaying(false);
    if (res.error) {
      ctx.toast("bad", res.error);
      return;
    }
    ctx.toast("ok", `Recorded ${rupees(res.data?.amount_rupees ?? 0)} paid to ${payTarget.member.name} for ${payTarget.ids.length} referral(s).`);
    setPayTarget(null);
    setSelected(new Set());
    void loadDashboard();
  };

  const handleMarkPaid = async () => {
    if (!payingItem) return;
    if (!utrInput.trim()) {
      ctx.toast("bad", "Please enter the Bank / UPI transfer UTR number.");
      return;
    }
    setProcessingId(payingItem.id);
    const res = await adminProcessPayout(payingItem.id, "paid", utrInput.trim());
    setProcessingId(null);
    if (res.error) {
      ctx.toast("bad", res.error);
      return;
    }
    ctx.toast("ok", `Marked ${rupees(payingItem.amount_rupees)} payout to ${payingItem.user_name} as Paid!`);
    setPayingItem(null);
    setUtrInput("");
    void loadDashboard();
  };

  const handleDecline = async (id: string, name: string) => {
    setProcessingId(id);
    const res = await adminProcessPayout(id, "declined");
    setProcessingId(null);
    if (res.error) {
      ctx.toast("bad", res.error);
      return;
    }
    ctx.toast("ok", `Declined payout request for ${name} and refunded coins.`);
    void loadDashboard();
  };

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    ctx.toast("ok", `Copied ${label} to clipboard!`);
  };

  const exportPayoutsCsv = () => {
    downloadCsv(
      `payout-history-${ctx.today}.csv`,
      ["Date", "Applicant", "Mobile", "Method / UPI", "Coins", "Amount (INR)", "Status", "Paid At", "UTR Reference"],
      payouts.map((p) => [p.created_at, p.user_name, p.user_phone, p.upi_id || "Bank Transfer", p.coins, p.amount_rupees, p.status, p.paid_at ?? "", p.payout_utr ?? ""])
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Stats Strip */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="People referred" value={String(referrals.length)} foot={`${wallets.filter((w) => w.referral_count > 0).length} members referring`} tone="ok" />
        <Stat label="Approved referrals" value={String(approvedReferrals.length)} foot="Coins earned by referrers" tone="gold" />
        <Stat label="Waiting for payment" value={rupees(coinsToRupees(unpaidCoinsTotal, cfg.rupees_per_1000_coins))} foot={`${unpaidCoinsTotal.toLocaleString("en-IN")} coins unpaid`} tone={unpaidCoinsTotal ? "warn" : "ok"} />
        <Stat label="Paid out" value={rupees(totalPaidRupees)} foot={`${paidPayouts.length} transfers`} tone="ok" />
      </section>

      {/* Admin Settings & Conversion Configuration Card */}
      <section className="card card-glow p-5 sm:p-6 border border-gold/30 bg-gradient-to-br from-[#0c1c11] via-[#07130a] to-[#040905]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b hairline pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-gold/30 bg-gold/15 text-gold">
              <Sliders size={20} />
            </span>
            <div>
              <h2 className="display text-lg sm:text-xl font-bold text-ink">
                Referral &amp; Coin Program Settings
              </h2>
              <p className="text-xs text-muted">
                Configure how many coins users earn per referral. Admin decides when to pay out to their bank account.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink">
              <input
                type="checkbox"
                checked={cfg.enabled}
                onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
                className="size-4 accent-emerald-500 rounded"
              />
              <span>Program Active</span>
            </label>
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-muted">
              Coins Per Referral
              <input
                type="number"
                min={100}
                step={50}
                value={cfg.coins_per_referral}
                onChange={(e) => setCfg({ ...cfg, coins_per_referral: Number(e.target.value) })}
                className="mt-1 font-mono text-sm"
                required
              />
            </label>
            <p className="mt-1 text-[0.7rem] text-muted">e.g. 1000 coins per approved referral.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted">
              Exchange Rate (₹ per 1,000 Coins)
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs text-muted font-mono">₹</span>
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={cfg.rupees_per_1000_coins}
                  onChange={(e) => setCfg({ ...cfg, rupees_per_1000_coins: Number(e.target.value) })}
                  className="font-mono text-sm pl-7"
                  required
                />
              </div>
            </label>
            <p className="mt-1 text-[0.7rem] text-muted">
              Current: <strong>{cfg.coins_per_referral} Coins = {rupees(Math.floor((cfg.coins_per_referral / 1000) * cfg.rupees_per_1000_coins))}</strong>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted">
              Min. Coins for Payout
              <input
                type="number"
                min={100}
                step={100}
                value={cfg.min_redeem_coins}
                onChange={(e) => setCfg({ ...cfg, min_redeem_coins: Number(e.target.value) })}
                className="mt-1 font-mono text-sm"
                required
              />
            </label>
            <p className="mt-1 text-[0.7rem] text-muted">Reference threshold for bank payout.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted">
              Reward Trigger Event
              <select
                value={cfg.award_trigger}
                onChange={(e) => setCfg({ ...cfg, award_trigger: e.target.value as "fee_verified" | "submitted" })}
                className="mt-1 text-xs"
              >
                <option value="fee_verified">When referred application is approved (Recommended)</option>
                <option value="submitted">Immediately on application submit</option>
              </select>
            </label>
            <p className="mt-1 text-[0.7rem] text-muted">Prevents fake applicant spam.</p>
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-2">
            <button type="submit" disabled={savingCfg} className="btn btn-gold btn-sm font-bold">
              {savingCfg ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Configuration
            </button>
          </div>
        </form>
      </section>

      {/* Referrals by Member: counts + tick-and-pay */}
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="display text-lg font-bold text-ink flex items-center gap-2">
              <Users size={18} className="text-gold" /> Referrals by Member
            </h2>
            <p className="text-xs text-muted">
              Who referred whom, how many were approved, and which ones you have paid. Open a member, tick the approved unpaid referrals and mark them paid.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-muted" />
              <input
                type="text"
                placeholder="Search name, phone, code"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="!h-8 !w-44 pl-8 text-xs sm:!w-56"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted cursor-pointer">
              <input type="checkbox" checked={onlyWithReferrals} onChange={(e) => setOnlyWithReferrals(e.target.checked)} className="size-4 accent-emerald-500" />
              Only members with referrals
            </label>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-muted flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Loading referrals…
          </div>
        ) : visibleMembers.length === 0 ? (
          <Empty>{wallets.length === 0 ? "No referral codes yet. Codes are created when an application is approved." : "No members match."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b hairline bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold sm:px-6">Member</th>
                  <th className="px-3 py-3 font-semibold">Referral ID</th>
                  <th className="px-3 py-3 font-semibold text-center">Applied</th>
                  <th className="px-3 py-3 font-semibold text-center">Approved</th>
                  <th className="px-3 py-3 font-semibold text-center">In review</th>
                  <th className="px-3 py-3 font-semibold text-center">Not approved</th>
                  <th className="px-3 py-3 font-semibold">Paid</th>
                  <th className="px-3 py-3 font-semibold">Unpaid</th>
                  <th className="px-5 py-3 text-right font-semibold sm:px-6">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleMembers.map((w) => {
                  const open = expanded === w.user_id;
                  const list = byMember.get(w.user_id) ?? [];
                  const unpaidCoins = w.unpaid_coins ?? 0;
                  const paidCoins = w.paid_coins ?? 0;
                  const selectedHere = list.filter((r) => selected.has(r.id));
                  const selectedCoins = selectedHere.reduce((sum, r) => sum + r.coins_awarded, 0);
                  const payable = list.filter(isPayable);
                  return (
                    <Fragment key={w.user_id}>
                      <tr className={`transition ${open ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"}`}>
                        <td className="px-5 py-3.5 sm:px-6">
                          <p className="font-semibold text-ink">{w.name}</p>
                          <p className="text-xs text-muted">{w.phone ? formatPhone(w.phone) : "—"}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <button type="button" onClick={() => copyToClipboard(w.referral_code, "referral ID")} className="inline-flex items-center gap-1 font-mono text-xs text-gold hover:underline">
                            {w.referral_code} <Copy size={11} />
                          </button>
                        </td>
                        <td className="px-3 py-3.5 text-center font-bold text-ink">{w.referral_count}</td>
                        <td className="px-3 py-3.5 text-center font-semibold text-ok">{w.verified_count}</td>
                        <td className="px-3 py-3.5 text-center text-warn">{w.pending_count ?? 0}</td>
                        <td className="px-3 py-3.5 text-center text-bad">{w.declined_count ?? 0}</td>
                        <td className="px-3 py-3.5">
                          <p className="font-semibold text-ok">{w.paid_count ?? 0}</p>
                          <p className="text-[0.7rem] text-muted">{rupees(coinsToRupees(paidCoins, cfg.rupees_per_1000_coins))}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className={`font-semibold ${(w.unpaid_count ?? 0) > 0 ? "text-gold" : "text-muted"}`}>{w.unpaid_count ?? 0}</p>
                          <p className="text-[0.7rem] text-muted">
                            {unpaidCoins.toLocaleString("en-IN")} coins · {rupees(coinsToRupees(unpaidCoins, cfg.rupees_per_1000_coins))}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-right sm:px-6">
                          <button
                            type="button"
                            disabled={list.length === 0}
                            onClick={() => {
                              setExpanded(open ? null : w.user_id);
                              setSelected(new Set());
                            }}
                            className="btn btn-outline btn-xs disabled:opacity-40"
                            aria-expanded={open}
                          >
                            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {open ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-white/[0.02]">
                          <td colSpan={9} className="px-5 pb-5 pt-1 sm:px-6">
                            <div className="overflow-hidden rounded-xl border hairline">
                              <table className="w-full text-sm">
                                <thead className="bg-white/[0.03] text-left text-[0.7rem] uppercase tracking-wide text-muted">
                                  <tr>
                                    <th className="w-10 px-3 py-2">
                                      <input
                                        type="checkbox"
                                        aria-label="Tick all approved unpaid referrals"
                                        disabled={payable.length === 0}
                                        checked={payable.length > 0 && payable.every((r) => selected.has(r.id))}
                                        onChange={(e) => setSelected(e.target.checked ? new Set(payable.map((r) => r.id)) : new Set())}
                                        className="size-4 accent-emerald-500"
                                      />
                                    </th>
                                    <th className="px-3 py-2 font-semibold">Referred person</th>
                                    <th className="px-3 py-2 font-semibold">Application</th>
                                    <th className="px-3 py-2 font-semibold">Status</th>
                                    <th className="px-3 py-2 font-semibold">Reward</th>
                                    <th className="px-3 py-2 text-right font-semibold">Applied on</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                  {list.map((r) => (
                                    <tr key={r.id}>
                                      <td className="px-3 py-2.5">
                                        <input
                                          type="checkbox"
                                          aria-label={`Tick ${r.referred_name}`}
                                          disabled={!isPayable(r)}
                                          checked={selected.has(r.id)}
                                          onChange={(e) => {
                                            const next = new Set(selected);
                                            if (e.target.checked) next.add(r.id);
                                            else next.delete(r.id);
                                            setSelected(next);
                                          }}
                                          className="size-4 accent-emerald-500 disabled:opacity-30"
                                        />
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <p className="font-semibold text-ink">{r.referred_name}</p>
                                        <p className="text-xs text-muted">{formatPhone(r.referred_phone)}</p>
                                      </td>
                                      <td className="px-3 py-2.5 text-xs">
                                        {r.referred_application_id ? (
                                          <button type="button" className="font-mono text-brand hover:underline" onClick={() => ctx.open(r.referred_application_id!)}>
                                            {r.application_ref || "Open"}
                                          </button>
                                        ) : (
                                          <span className="text-muted">—</span>
                                        )}
                                        {r.requested_amount ? <span className="block text-muted">{rupees(r.requested_amount)}</span> : null}
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <ReferralStatus r={r} />
                                      </td>
                                      <td className="px-3 py-2.5 text-xs">
                                        {r.status === "completed" ? (
                                          <>
                                            <span className="font-semibold text-gold-ink">{r.coins_awarded.toLocaleString("en-IN")} coins</span>
                                            <span className="block text-muted">{rupees(coinsToRupees(r.coins_awarded, cfg.rupees_per_1000_coins))}</span>
                                          </>
                                        ) : (
                                          <span className="text-muted">—</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-right text-xs text-muted">{dateOnly(r.created_at)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="flex flex-col gap-2 border-t hairline bg-white/[0.02] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-muted">
                                  {selectedHere.length
                                    ? `${selectedHere.length} ticked · ${selectedCoins.toLocaleString("en-IN")} coins = ${rupees(coinsToRupees(selectedCoins, cfg.rupees_per_1000_coins))}`
                                    : payable.length
                                      ? `${payable.length} approved referral${payable.length === 1 ? "" : "s"} waiting for payment. Tick the ones you are paying.`
                                      : "Nothing to pay right now."}
                                </p>
                                <button
                                  type="button"
                                  disabled={selectedHere.length === 0}
                                  onClick={() => {
                                    setPayTarget({ member: w, ids: selectedHere.map((r) => r.id), coins: selectedCoins });
                                    setPayUtr("");
                                    setPayNote("");
                                  }}
                                  className="btn btn-primary btn-sm font-bold disabled:opacity-40"
                                >
                                  <Landmark size={13} /> Mark ticked as paid
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bank Payout History */}
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="display text-lg font-bold text-ink flex items-center gap-2">
              <Wallet size={18} className="text-gold" /> Bank Payout History
            </h2>
            <p className="text-xs text-muted">Recorded bank transfers and any legacy payout requests ({pendingRupees > 0 ? `${rupees(pendingRupees)} pending` : "all settled"})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-muted" />
              <input
                type="text"
                placeholder="Search name, phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="!h-8 !w-44 pl-8 text-xs sm:!w-56"
              />
            </div>
            <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-xs">
              {(["all", "pending", "paid", "declined"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilter(t)}
                  className={`rounded-md px-2.5 py-1 font-semibold uppercase tracking-wider text-[0.68rem] transition ${
                    filter === t ? "bg-gold text-[#140f04]" : "text-muted hover:text-ink"
                  }`}
                >
                  {t}
                  {t === "pending" && pendingPayouts.length > 0 && (
                    <span className="ml-1 rounded-full bg-warn-soft px-1 text-warn">{pendingPayouts.length}</span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" onClick={exportPayoutsCsv} className="btn btn-outline btn-xs">
              <Download size={13} /> CSV
            </button>
          </div>
        </div>

        {filteredPayouts.length === 0 ? (
          <Empty>No payout records match this filter.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b hairline bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold sm:px-6">Applicant</th>
                  <th className="px-4 py-3 font-semibold">Coins Paid</th>
                  <th className="px-4 py-3 font-semibold">Cash Amount</th>
                  <th className="px-4 py-3 font-semibold">Method / Reference</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredPayouts.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-5 py-3.5 sm:px-6">
                      <p className="font-semibold text-ink">{p.user_name}</p>
                      <p className="text-xs text-muted">
                        {p.user_phone ? formatPhone(p.user_phone) : "—"} · {timeAgo(p.created_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-gold-ink font-semibold">
                      {p.coins.toLocaleString("en-IN")} Coins
                    </td>
                    <td className="px-4 py-3.5 font-bold text-ok text-base">
                      {rupees(p.amount_rupees)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-ink-2">
                      {p.upi_id || "Bank Transfer"}
                    </td>
                    <td className="px-4 py-3.5">
                      {p.status === "pending" ? (
                        <Pill tone="warn">Awaiting Transfer</Pill>
                      ) : p.status === "paid" ? (
                        <div>
                          <Pill tone="ok">Paid</Pill>
                          {p.payout_utr && (
                            <span className="block mt-0.5 font-mono text-[0.68rem] text-muted truncate max-w-[140px]">
                              UTR: {p.payout_utr}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Pill tone="bad">Declined</Pill>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right sm:px-6">
                      {p.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={processingId === p.id}
                            onClick={() => {
                              setPayingItem(p);
                              setUtrInput("");
                            }}
                            className="btn btn-primary btn-xs font-bold"
                          >
                            <Send size={12} /> Mark Paid
                          </button>
                          <button
                            type="button"
                            disabled={processingId === p.id}
                            onClick={() => void handleDecline(p.id, p.user_name)}
                            className="btn btn-ghost btn-xs text-bad hover:bg-bad/10"
                          >
                            Decline
                          </button>
                        </div>
                      ) : p.status === "paid" && p.paid_at ? (
                        <span className="text-xs text-muted">Paid on {dateOnly(p.paid_at)}</span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Referrals Activity Ledger */}
      <section className="card overflow-hidden">
        <h2 className="display border-b hairline px-5 py-4 text-lg font-bold text-ink sm:px-6 flex items-center gap-2">
          <Users size={18} className="text-emerald-400" /> Referrals Activity Ledger
        </h2>
        {referrals.length === 0 ? (
          <Empty>No referrals recorded yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="border-b hairline bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold sm:px-6">Referrer (Invited By)</th>
                  <th className="px-4 py-3 font-semibold">Referral Code</th>
                  <th className="px-4 py-3 font-semibold">Friend Invited</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Coins Awarded</th>
                  <th className="px-5 py-3 text-right font-semibold sm:px-6">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {referrals.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-5 py-3 sm:px-6">
                      <p className="font-semibold text-ink">{r.referrer_name}</p>
                      <p className="text-xs text-muted">{formatPhone(r.referrer_phone)}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gold">{r.referrer_code}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{r.referred_name}</p>
                      <p className="text-xs text-muted">{formatPhone(r.referred_phone)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ReferralStatus r={r} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-ok">
                      {r.coins_awarded ? `+${r.coins_awarded.toLocaleString("en-IN")} Coins` : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-muted sm:px-6">
                      {dateTime(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pay ticked referrals modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade" role="dialog" aria-modal="true">
          <div className="card w-full max-w-md p-6 border border-emerald-500/30 bg-[#061209] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b hairline pb-3">
              <h3 className="font-bold text-lg text-ink">Mark referrals as paid</h3>
              <button type="button" onClick={() => setPayTarget(null)} className="text-muted hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Member:</span>
                <span className="font-semibold text-ink">{payTarget.member.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Mobile:</span>
                <span className="font-semibold text-ink">{payTarget.member.phone ? formatPhone(payTarget.member.phone) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Referrals ticked:</span>
                <span className="font-semibold text-ink">{payTarget.ids.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Coins:</span>
                <span className="font-mono font-bold text-gold">{payTarget.coins.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Amount to pay:</span>
                <span className="font-bold text-ok text-base">{rupees(coinsToRupees(payTarget.coins, cfg.rupees_per_1000_coins))}</span>
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-muted">
                Bank / UPI transfer reference (UTR)
                <input
                  type="text"
                  placeholder="e.g. 428192018291"
                  value={payUtr}
                  onChange={(e) => setPayUtr(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  autoFocus
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Note (optional)
                <input
                  type="text"
                  placeholder="e.g. Paid to member's UPI"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="mt-1 text-sm"
                />
              </label>
              <p className="text-[0.7rem] text-muted">Send the money first, then record it here. This can't be undone.</p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button type="button" disabled={paying} onClick={() => void handlePayReferrals()} className="btn btn-primary btn-sm font-bold">
                {paying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirm paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal Dialog */}
      {payingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade">
          <div className="card w-full max-w-md p-6 border border-emerald-500/30 bg-[#061209] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b hairline pb-3">
              <h3 className="font-bold text-lg text-ink">Confirm Real Cash Payout</h3>
              <button
                type="button"
                onClick={() => setPayingItem(null)}
                className="text-muted hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Applicant:</span>
                <span className="font-semibold text-ink">{payingItem.user_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Cash Amount:</span>
                <span className="font-bold text-ok text-base">{rupees(payingItem.amount_rupees)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">Account / UPI:</span>
                <div className="flex items-center gap-1 font-mono font-bold text-gold">
                  <span>{payingItem.upi_id}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(payingItem.upi_id, "UPI ID")}
                    className="p-1 hover:text-white"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted">
                Bank / UPI Transfer Reference (UTR)
                <input
                  type="text"
                  placeholder="e.g. 428192018291"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  autoFocus
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingItem(null)}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingId === payingItem.id}
                onClick={() => void handleMarkPaid()}
                className="btn btn-primary btn-sm font-bold"
              >
                <Check size={15} /> Confirm Payout Sent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Approved, not yet paid → can be ticked for payment. */
function isPayable(r: ReferralItem) {
  return r.status === "completed" && !r.paid_at;
}

function ReferralStatus({ r }: { r: ReferralItem }) {
  if (r.status === "pending") return <Pill tone="warn">In review</Pill>;
  if (r.status === "declined") return <Pill tone="bad">Not approved</Pill>;
  if (r.paid_at)
    return (
      <div>
        <Pill tone="ok">Paid</Pill>
        <span className="mt-0.5 block text-[0.68rem] text-muted">
          {dateOnly(r.paid_at)}
          {r.payout_utr ? ` · UTR ${r.payout_utr}` : ""}
        </span>
      </div>
    );
  return <Pill tone="gold">Approved · unpaid</Pill>;
}
