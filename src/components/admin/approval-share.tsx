"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift, Loader2, Mail, MessageCircle } from "lucide-react";
import { useSettings } from "@/lib/settings-context";
import { appRef } from "@/lib/format";
import type { Application } from "@/lib/types";
import { adminReferralShare, buildApprovalMessage, DEFAULT_REFERRAL_CONFIG } from "@/lib/referral-system";
import type { AdminCtx } from "./admin-console";
import { whatsappLink } from "./portfolio";

type SiteLike = { company_name?: string; support_phone?: string; support_email?: string } | null | undefined;

/** Referral codes already fetched this session (application id → code), so table buttons stay fast. */
const codeCache = new Map<string, { code: string; coins: number }>();

async function getCode(app: Application, demo: boolean): Promise<{ code: string; coins: number }> {
  const hit = codeCache.get(app.id);
  if (hit) return hit;
  if (demo) return { code: "MP" + app.id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase(), coins: DEFAULT_REFERRAL_CONFIG.coins_per_referral };
  const res = await adminReferralShare(app.id);
  if (res.error || !res.data) throw new Error(res.error || "Could not load the referral code.");
  const v = { code: res.data.code, coins: res.data.coins_per_referral };
  codeCache.set(app.id, v);
  return v;
}

function approvalMessage(app: Application, code: string, coins: number, site: SiteLike) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return buildApprovalMessage({
    name: app.full_name,
    phone: app.phone,
    appRef: appRef(app),
    amount: app.requested_amount,
    category: app.category,
    company: site?.company_name || "Money Pay",
    code,
    link: `${origin}/apply?ref=${encodeURIComponent(code)}`,
    coins,
    supportPhone: site?.support_phone || undefined,
    supportEmail: site?.support_email || undefined,
  });
}

/**
 * Compact WhatsApp + Email buttons for a table row. Only for approved applications; other rows show "—".
 * Clicks don't open the row. The referral code is fetched on click (then cached).
 */
export function ApprovalQuickActions({ app, ctx, email }: { app: Application | null | undefined; ctx: AdminCtx; email?: string | null }) {
  const { site } = useSettings();
  const [busy, setBusy] = useState<"wa" | "mail" | null>(null);
  if (!app || app.status !== "accepted") return <span className="text-xs text-faint">—</span>;
  const to = (email || app.contact_email || "").trim();

  async function send(kind: "wa" | "mail", e: React.MouseEvent) {
    e.stopPropagation();
    if (!app) return;
    // Open the WhatsApp tab right away (inside the click) so the browser doesn't block it as a pop-up.
    const tab = kind === "wa" ? window.open("about:blank", "_blank") : null;
    setBusy(kind);
    try {
      const { code, coins } = await getCode(app, ctx.demo);
      const msg = approvalMessage(app, code, coins, site);
      if (kind === "wa") {
        const url = whatsappLink(app.phone, msg.text);
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } else {
        window.location.href = `mailto:${to}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.text)}`;
      }
    } catch (err) {
      tab?.close();
      ctx.toast("bad", err instanceof Error ? err.message : "Could not prepare the message.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => void send("wa", e)}
        disabled={busy !== null}
        title={`Send approval + referral link to ${app.full_name} on WhatsApp`}
        aria-label={`WhatsApp approval message to ${app.full_name}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
      >
        {busy === "wa" ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />} WhatsApp
      </button>
      <button
        type="button"
        onClick={(e) => void send("mail", e)}
        disabled={busy !== null || !to}
        title={to ? `Email approval + referral link to ${to}` : "No email ID on file for this applicant"}
        aria-label={`Email approval message to ${app.full_name}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 text-xs font-semibold text-ink-2 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "mail" ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Email
      </button>
    </div>
  );
}

/**
 * "Loan approved" message with the applicant's own referral link, sent by WhatsApp or email.
 * Only for approved applications (payment + KYC verified). Both buttons open the admin's own
 * WhatsApp / email app with the message filled in; the admin presses Send.
 */
export function ApprovalShare({ app, ctx, email }: { app: Application; ctx: AdminCtx; email?: string | null }) {
  const { site } = useSettings();
  const [code, setCode] = useState<string | null>(null);
  const [coins, setCoins] = useState(DEFAULT_REFERRAL_CONFIG.coins_per_referral);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setCode(null);
    setErr("");
    if (app.status !== "accepted") return;
    if (ctx.demo) {
      setCode("MP" + app.id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase());
      return;
    }
    void adminReferralShare(app.id).then((res) => {
      if (!alive) return;
      if (res.error || !res.data) setErr(res.error || "Could not load the referral code.");
      else {
        setCode(res.data.code);
        setCoins(res.data.coins_per_referral);
      }
    });
    return () => {
      alive = false;
    };
  }, [app.id, app.status, ctx.demo]);

  if (app.status !== "accepted") return null;

  const to = (email || app.contact_email || "").trim();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = code ? `${origin}/apply?ref=${encodeURIComponent(code)}` : "";
  const msg = code
    ? buildApprovalMessage({
        name: app.full_name,
        phone: app.phone,
        appRef: appRef(app),
        amount: app.requested_amount,
        category: app.category,
        company: site?.company_name || "Money Pay",
        code,
        link,
        coins,
        supportPhone: site?.support_phone || undefined,
        supportEmail: site?.support_email || undefined,
      })
    : null;

  const mailHref = msg && to ? `mailto:${to}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.text)}` : undefined;

  async function copy() {
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      ctx.toast("bad", "Couldn't copy. Select the text manually.");
    }
  }

  return (
    <div className="rounded-xl border border-ok/30 bg-ok/[0.06] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Gift size={15} className="text-gold" /> Send approval + referral link
        </p>
        {code ? (
          <span className="rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-xs font-bold text-gold">{code}</span>
        ) : !err ? (
          <Loader2 size={14} className="animate-spin text-muted" />
        ) : null}
      </div>
      {err ? (
        <p className="mt-2 text-xs text-bad">{err}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            className={`btn btn-sm font-bold ${msg ? "btn-primary" : "btn-outline pointer-events-none opacity-50"}`}
            href={msg ? whatsappLink(app.phone, msg.text) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!msg}
          >
            <MessageCircle size={14} /> WhatsApp
          </a>
          <a
            className={`btn btn-outline btn-sm ${mailHref ? "" : "pointer-events-none opacity-50"}`}
            href={mailHref}
            aria-disabled={!mailHref}
            title={to ? `Email ${to}` : "No email ID on file for this applicant"}
          >
            <Mail size={14} /> {to ? "Email" : "No email"}
          </a>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()} disabled={!msg}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy message"}
          </button>
        </div>
      )}
    </div>
  );
}
