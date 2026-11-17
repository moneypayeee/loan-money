"use client";

import { supabase } from "./supabase";

export type ReferralConfig = {
  enabled: boolean;
  coins_per_referral: number;
  rupees_per_1000_coins: number;
  min_redeem_coins: number;
  award_trigger: "fee_verified" | "submitted";
};

export type UserWallet = {
  user_id: string;
  referral_code: string;
  coins_balance: number;
  saved_upi_id: string | null;
};

export type PayoutRequest = {
  id: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  upi_id: string;
  coins: number;
  amount_rupees: number;
  status: "pending" | "paid" | "declined";
  created_at: string;
  paid_at?: string | null;
  payout_utr?: string | null;
  admin_note?: string | null;
};

export type ReferralItem = {
  id: string;
  referrer_user_id: string;
  referrer_name: string;
  referrer_phone: string;
  referrer_code: string;
  referred_name: string;
  referred_phone: string;
  coins_awarded: number;
  /** pending = referred application under review · completed = approved, coins earned · declined = rejected */
  status: "pending" | "completed" | "declined";
  created_at: string;
  referred_application_id?: string | null;
  application_ref?: string | null;
  application_status?: string | null;
  requested_amount?: number | null;
  completed_at?: string | null;
  /** Set when the admin has paid this referral out. */
  paid_at?: string | null;
  payout_utr?: string | null;
};

export type UserReferralPortal = {
  config: ReferralConfig;
  wallet: UserWallet;
  referrals: ReferralItem[];
  payouts: PayoutRequest[];
};

export type ReferrerSummary = {
  user_id: string;
  referral_code: string;
  coins_balance: number;
  name: string;
  phone: string;
  email?: string | null;
  /** Everyone who applied with this member's code. */
  referral_count: number;
  /** Approved (coins earned). */
  verified_count: number;
  pending_count?: number;
  declined_count?: number;
  paid_count?: number;
  unpaid_count?: number;
  paid_coins?: number;
  unpaid_coins?: number;
};

export type AdminReferralsDashboard = {
  config: ReferralConfig;
  payouts: PayoutRequest[];
  referrals: ReferralItem[];
  wallets?: ReferrerSummary[];
};

export const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  enabled: true,
  coins_per_referral: 1000,
  rupees_per_1000_coins: 100, // 1000 coins = ₹100
  min_redeem_coins: 1000,
  award_trigger: "fee_verified",
};

export function coinsToRupees(coins: number, rupeesPer1000: number): number {
  return Math.floor((coins / 1000) * rupeesPer1000);
}

export function rupeesToCoins(rupees: number, rupeesPer1000: number): number {
  if (rupeesPer1000 <= 0) return 0;
  return Math.floor((rupees / rupeesPer1000) * 1000);
}

export async function fetchPublicReferralConfig(): Promise<ReferralConfig> {
  if (!supabase) return DEFAULT_REFERRAL_CONFIG;
  try {
    const { data, error } = await supabase
      .from("referral_config")
      .select("enabled, coins_per_referral, rupees_per_1000_coins, min_redeem_coins, award_trigger")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_REFERRAL_CONFIG;
    return { ...DEFAULT_REFERRAL_CONFIG, ...(data as Partial<ReferralConfig>) };
  } catch {
    return DEFAULT_REFERRAL_CONFIG;
  }
}

export async function getMyReferralPortal(): Promise<{ data?: UserReferralPortal; error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("get_my_referral_portal");
  if (error) return { error: error.message };
  return { data: data as UserReferralPortal };
}

export async function requestReferralPayout(
  coins: number,
  upiId: string
): Promise<{ data?: { payout: PayoutRequest; coins_balance: number }; error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("request_referral_payout", {
    p_coins: coins,
    p_upi_id: upiId.trim(),
  });
  if (error) return { error: error.message };
  return { data: data as { payout: PayoutRequest; coins_balance: number } };
}

export async function adminGetReferralsDashboard(): Promise<{ data?: AdminReferralsDashboard; error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("admin_get_referrals_dashboard");
  if (error) return { error: error.message };
  return { data: data as AdminReferralsDashboard };
}

export async function adminUpdateReferralConfig(cfg: ReferralConfig): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.rpc("admin_update_referral_config", { p: cfg });
  return error ? { error: error.message } : {};
}

export async function adminProcessPayout(
  id: string,
  action: "paid" | "declined",
  utr?: string,
  note?: string
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.rpc("admin_process_payout", {
    p_id: id,
    p_action: action,
    p_utr: utr ?? null,
    p_note: note ?? null,
  });
  return error ? { error: error.message } : {};
}

export async function adminIssueBankPayout(
  userId: string,
  coins: number,
  utr: string,
  note?: string
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.rpc("admin_issue_bank_payout", {
    p_user_id: userId,
    p_coins: coins,
    p_utr: utr.trim(),
    p_note: note ?? null,
  });
  return error ? { error: error.message } : {};
}

/** Admin: pay several approved referrals of one member together. */
export async function adminPayReferrals(
  ids: string[],
  utr: string,
  note?: string
): Promise<{ data?: { count: number; coins: number; amount_rupees: number }; error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("admin_pay_referrals", {
    p_ids: ids,
    p_utr: utr.trim(),
    p_note: note?.trim() || null,
  });
  if (error) return { error: error.message };
  return { data: data as { count: number; coins: number; amount_rupees: number } };
}

/** Admin: the referral code of an approved applicant (created on first use). */
export async function adminReferralShare(
  applicationId: string
): Promise<{ data?: { code: string; coins_per_referral: number; enabled: boolean }; error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("admin_referral_share", { p_id: applicationId });
  if (error) return { error: error.message };
  return { data: data as { code: string; coins_per_referral: number; enabled: boolean } };
}

/** Public: does this referral code exist? null = couldn't check. */
export async function checkReferralCode(code: string): Promise<boolean | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("referral_code_valid", { p_code: code });
  if (error) return null;
  return Boolean(data);
}

/** Public: has this mobile / email applied before? Returns "phone", "email" or null (also null if the check fails). */
export async function checkApplicantExists(phone: string, email?: string): Promise<"phone" | "email" | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("check_applicant_exists", { p_phone: phone, p_email: email || null });
  if (error) return null;
  return data === "phone" || data === "email" ? data : null;
}

/** Cleans a referral code typed or taken from a link. */
export function normalizeReferralCode(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
}

/** The fixed "loan approved" message admins send on WhatsApp and email. */
export function buildApprovalMessage(o: {
  name: string;
  phone: string;
  appRef: string;
  amount: number;
  category: string;
  company: string;
  code: string;
  link: string;
  coins: number;
  supportPhone?: string;
  supportEmail?: string;
}): { subject: string; text: string } {
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(o.amount);
  const help = [o.supportPhone && `WhatsApp/Call: ${o.supportPhone}`, o.supportEmail && `Email: ${o.supportEmail}`].filter(Boolean).join(" · ");
  const lines = [
    `Dear ${o.name},`,
    ``,
    `Congratulations! Your loan application has been APPROVED.`,
    ``,
    `Application ID: ${o.appRef}`,
    `Name: ${o.name}`,
    `Mobile: +91 ${o.phone}`,
    `Loan amount requested: ${amount}`,
    `Category: ${o.category}`,
    ``,
    `Our partner bank will contact you shortly for the next steps.`,
    ``,
    `REFER & EARN`,
    `Your referral ID: ${o.code}`,
    `Share this link with friends and family: ${o.link}`,
    `You earn ${o.coins.toLocaleString("en-IN")} coins for every person whose loan application is approved.`,
    ``,
    ...(help ? [`Need help? ${help}`, ``] : []),
    `Thank you,`,
    `${o.company} Team`,
  ];
  return { subject: `Your loan application ${o.appRef} is approved – ${o.company}`, text: lines.join("\n") };
}

export function generateShareUrl(code: string): string {
  if (typeof window === "undefined") return `https://loan-money.vercel.app/apply?ref=${code}`;
  return `${window.location.origin}/apply?ref=${code}`;
}

export function generateWhatsAppMessage(code: string, coins: number, rupees: number): string {
  const url = generateShareUrl(code);
  return `Hey! Apply for loan assistance with MoneyPayee. It's fast, transparent, and 100% digital.\n\nUse my referral code *${code}* or tap here to apply:\n${url}\n\n(Refer friends and get ${coins} Coins = ₹${rupees} real money!)`;
}
