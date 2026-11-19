"use client";

import { useEffect, useState } from "react";
import { BadgeIndianRupee, Check, Loader2, QrCode, Upload } from "lucide-react";
import { useSettings } from "@/lib/settings-context";
import type { AdminCtx } from "./admin-console";

const MIN_FEE = 1;
const MAX_FEE = 100000;

/** Sends a partial update to the payment-settings API (admin only). */
async function savePaymentSettings(body: Record<string, unknown>) {
  const { supabase } = await import("@/lib/supabase");
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
  const res = await fetch("/api/admin/payment-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not save the settings.");
  return data.payment;
}

export function SettingsPanel({ ctx }: { ctx: AdminCtx }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <FeeCard ctx={ctx} />
      <PaymentDetailsCard ctx={ctx} />
    </div>
  );
}

function FeeCard({ ctx }: { ctx: AdminCtx }) {
  const { payment, qrUrl, updatePayment } = useSettings();
  const current = payment?.fee ?? 299;
  const [value, setValue] = useState(String(current));
  const [saving, setSaving] = useState(false);

  // Show the live fee once it has loaded from the database
  useEffect(() => setValue(String(current)), [current]);

  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= MIN_FEE && n <= MAX_FEE;
  const changed = valid && n !== current;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    if (ctx.demo) return ctx.toast("bad", "Demo mode: settings can't be saved.");
    if (!window.confirm(`Change the application fee from ₹${current} to ₹${n}?\n\nNew applicants will be asked to pay ₹${n}. Applications already submitted keep the fee they paid.`)) return;
    setSaving(true);
    try {
      const p = await savePaymentSettings({ fee: n });
      updatePayment(p, p?.qr_url || qrUrl);
      ctx.toast("ok", `Application fee is now ₹${n}.`);
    } catch (err) {
      ctx.toast("bad", err instanceof Error ? err.message : "Could not save the fee.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold">
          <BadgeIndianRupee size={18} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Application fee</h2>
          <p className="text-xs text-muted">The one-time fee every applicant pays</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Current fee</p>
        <p className="display mt-1 text-3xl text-gold">₹{current}</p>
      </div>

      <form onSubmit={save} className="mt-5 space-y-3">
        <label className="block text-xs font-semibold text-muted">
          New fee (₹)
          <input
            type="number"
            inputMode="numeric"
            min={MIN_FEE}
            max={MAX_FEE}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 font-mono text-lg font-semibold"
            aria-invalid={!valid}
            required
          />
        </label>
        {!valid && <p className="text-xs text-bad">Enter a whole number between ₹1 and ₹1,00,000.</p>}
        <ul className="space-y-1 text-xs text-muted">
          <li>• The website, apply page and Razorpay checkout all use this amount straight away.</li>
          <li>• Applications already submitted keep the fee they paid.</li>
          <li>• If you take UPI payments by QR, check the amount applicants pay matches.</li>
        </ul>
        <div className="flex justify-end pt-1">
          <button type="submit" disabled={!changed || saving} className="btn btn-gold btn-sm font-bold">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save fee
          </button>
        </div>
      </form>
    </section>
  );
}

function PaymentDetailsCard({ ctx }: { ctx: AdminCtx }) {
  const { payment, qrUrl, updatePayment } = useSettings();
  const [payeeName, setPayeeName] = useState(payment?.payee_name || "");
  const [upiId, setUpiId] = useState(payment?.upi_id || "");
  const [newQr, setNewQr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(qrUrl);
  const [saving, setSaving] = useState(false);

  // Fill the form once the live values have loaded
  useEffect(() => {
    setPayeeName(payment?.payee_name || "");
    setUpiId(payment?.upi_id || "");
  }, [payment?.payee_name, payment?.upi_id]);
  useEffect(() => {
    if (!newQr) setPreview(qrUrl);
  }, [qrUrl, newQr]);

  function pickQr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return ctx.toast("bad", "QR image must be under 3 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      setNewQr(reader.result as string);
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (ctx.demo) return ctx.toast("bad", "Demo mode: settings can't be saved.");
    setSaving(true);
    try {
      const p = await savePaymentSettings({ payee_name: payeeName, upi_id: upiId, qr_base64: newQr });
      updatePayment(p, p?.qr_url || preview);
      setNewQr(null);
      ctx.toast("ok", "Payment details updated.");
    } catch (err) {
      ctx.toast("bad", err instanceof Error ? err.message : "Could not save the payment details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold">
          <QrCode size={18} />
        </span>
        <div>
          <h2 className="font-bold text-ink">Payment details</h2>
          <p className="text-xs text-muted">What applicants see on the payment step</p>
        </div>
      </div>

      <form onSubmit={save} className="mt-5 space-y-4 text-sm">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row">
          <div className="flex size-28 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-md">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Payment QR" className="size-full object-contain" />
            ) : (
              <span className="text-center text-xs text-muted">No QR</span>
            )}
          </div>
          <div className="space-y-2 text-center sm:text-left">
            <p className="text-xs font-semibold text-ink">UPI QR code</p>
            <p className="text-[0.72rem] text-muted">PNG, JPG or WebP. Square works best.</p>
            <label className="btn btn-outline btn-xs inline-flex cursor-pointer items-center gap-1.5 font-semibold">
              <Upload size={13} /> {newQr ? "Choose another" : "Upload new QR"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickQr} />
            </label>
            {newQr && <p className="text-[0.7rem] font-semibold text-gold">New QR selected. Save to publish it.</p>}
          </div>
        </div>

        <label className="block text-xs font-semibold text-muted">
          Payee name
          <input type="text" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="e.g. MoneyPayee Services" className="mt-1 text-sm font-semibold" required />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Payee UPI ID
          <input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value.trim())} placeholder="e.g. moneypayee@icici" className="mt-1 font-mono text-sm" required />
        </label>

        <div className="flex justify-end pt-1">
          <button type="submit" disabled={saving} className="btn btn-gold btn-sm font-bold">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save payment details
          </button>
        </div>
      </form>
    </section>
  );
}
