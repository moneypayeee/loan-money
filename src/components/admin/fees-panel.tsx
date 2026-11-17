"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Loader2, QrCode, Upload, X } from "lucide-react";
import { appRef, dateTime, rupees } from "@/lib/format";
import { formatPhone } from "@/lib/phone-auth";
import { downloadCsv } from "@/lib/csv";
import { useSettings } from "@/lib/settings-context";
import type { Application } from "@/lib/types";
import type { AdminCtx } from "./admin-console";
import { Empty, ExportButton, Pill, plural, SearchBox, Segmented, Stat } from "./kit";

type Filter = "all" | "to_check" | "received" | "not_found";

const label = (a: Application): { text: string; tone: "ok" | "warn" | "bad" } =>
  a.status === "pending"
    ? { text: "To check", tone: "warn" }
    : a.payment_verified
      ? { text: "Received", tone: "ok" }
      : { text: "Not found", tone: "bad" };

/** Last 12 months as YYYY-MM, newest first. */
function lastMonths(today: string) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}
const monthName = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export function FeesPanel({ ctx }: { ctx: AdminCtx }) {
  const { payment, qrUrl, updatePayment } = useSettings();
  const [filter, setFilter] = useState<Filter>("all");
  const [month, setMonth] = useState("");
  const [q, setQ] = useState("");

  const [showQrModal, setShowQrModal] = useState(false);
  const [payeeName, setPayeeName] = useState(payment?.payee_name || "MoneyPayee");
  const [upiId, setUpiId] = useState(payment?.upi_id || "");
  const [fee, setFee] = useState(payment?.fee || 299);
  const [newQrBase64, setNewQrBase64] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(qrUrl);
  const [savingQr, setSavingQr] = useState(false);

  const handleQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      setNewQrBase64(res);
      setPreviewUrl(res);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveQr = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingQr(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
      const res = await fetch("/api/admin/payment-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          payee_name: payeeName,
          upi_id: upiId,
          fee: Number(fee),
          qr_base64: newQrBase64,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        updatePayment(data.payment, data.payment?.qr_url || previewUrl);
        ctx.toast("ok", "QR Scanner and Payee settings updated successfully!");
        setShowQrModal(false);
      } else {
        ctx.toast("bad", data?.error || "Failed to update payment settings.");
      }
    } catch (err: unknown) {
      ctx.toast("bad", err instanceof Error ? err.message : "Error saving QR");
    } finally {
      setSavingQr(false);
    }
  };

  const inMonth = useMemo(() => ctx.apps.filter((a) => !month || a.created_at.slice(0, 7) === month), [ctx.apps, month]);

  const match: Record<Filter, (a: Application) => boolean> = {
    all: () => true,
    to_check: (a) => a.status === "pending",
    received: (a) => a.status !== "pending" && a.payment_verified,
    not_found: (a) => a.status !== "pending" && !a.payment_verified,
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inMonth
      .filter(match[filter])
      .filter((a) => !needle || [a.full_name, a.phone, a.transaction_id, appRef(a)].some((s) => s.toLowerCase().includes(needle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inMonth, filter, q]);

  const verified = inMonth.filter((a) => a.payment_verified);
  const received = verified.reduce((s, a) => s + a.fee, 0);
  const notFound = inMonth.filter(match.not_found);
  const toCheck = inMonth.filter(match.to_check);

  function exportCsv() {
    downloadCsv(
      `fee-payments-${month || "all"}-${ctx.today}.csv`,
      ["Submitted", "Reference", "Name", "Mobile", "Fee", "UTR", "Paid to", "Payee UPI", "Payment status", "Decision", "Decided at"],
      rows.map((a) => [
        a.created_at,
        appRef(a),
        a.full_name,
        a.phone,
        a.fee,
        a.transaction_id,
        a.payee_name,
        a.upi_id,
        label(a).text,
        a.status,
        a.reviewed_at ?? "",
      ]),
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Confirmed received" value={rupees(received)} foot={plural(verified.length, "payment")} tone="ok" onClick={() => setFilter("received")} />
        <Stat
          label="To check"
          value={String(toCheck.length)}
          foot={`${rupees(toCheck.reduce((s, a) => s + a.fee, 0))} awaiting confirmation`}
          tone={toCheck.length ? "warn" : "default"}
          onClick={() => setFilter("to_check")}
        />
        <Stat label="Not found" value={String(notFound.length)} foot="UTR not verified in account" tone="bad" onClick={() => setFilter("not_found")} />
        <Stat label="Total fee volume" value={rupees(inMonth.reduce((s, a) => s + a.fee, 0))} foot={`${inMonth.length} applications submitted`} tone="gold" />
      </section>

      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <Segmented
          label="Filter payments"
          value={filter}
          onChange={setFilter}
          options={[
            ["all", "All", inMonth.length],
            ["to_check", "To check", toCheck.length],
            ["received", "Received", inMonth.filter(match.received).length],
            ["not_found", "Not found", inMonth.filter(match.not_found).length],
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row 2xl:w-auto">
          <select className="sm:!w-48" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            <option value="">All time</option>
            {lastMonths(ctx.today).map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
          <SearchBox value={q} onChange={setQ} placeholder="UTR, name, mobile or MP-" />
          <ExportButton onClick={exportCsv} disabled={!rows.length} label="CSV" />
          <button
            type="button"
            onClick={() => {
              setPayeeName(payment?.payee_name || "MoneyPayee");
              setUpiId(payment?.upi_id || "");
              setFee(payment?.fee || 299);
              setPreviewUrl(qrUrl);
              setShowQrModal(true);
            }}
            className="btn btn-gold btn-sm font-semibold flex items-center gap-1.5 shrink-0"
          >
            <QrCode size={14} /> Upload QR Scanner
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty>{q ? "No payments match your search." : "No payments here."}</Empty>
        ) : (
          <>
            <table className="hidden w-full text-sm lg:table">
              <thead className="border-b hairline bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Paid by</th>
                  <th className="px-5 py-3 font-semibold">UTR</th>
                  <th className="px-5 py-3 font-semibold">Paid to</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => {
                  const s = label(a);
                  return (
                    <tr key={a.id} onClick={() => ctx.open(a.id)} className="cursor-pointer transition hover:bg-white/[0.03]">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold">{a.full_name}</p>
                        <p className="text-xs text-muted">{formatPhone(a.phone)}</p>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs">{a.transaction_id}</td>
                      <td className="px-5 py-3.5 text-xs text-muted">
                        {a.payee_name}
                        <span className="block font-mono">{a.upi_id}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted">{dateTime(a.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <Pill tone={s.tone}>{s.text}</Pill>
                      </td>
                      <td className="pr-4 text-faint">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ul className="divide-y divide-line lg:hidden">
              {rows.map((a) => {
                const s = label(a);
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => ctx.open(a.id)} className="w-full px-4 py-4 text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{a.full_name}</p>
                          <p className="truncate font-mono text-xs text-muted">{a.transaction_id}</p>
                        </div>
                        <Pill tone={s.tone}>{s.text}</Pill>
                      </div>
                      <p className="mt-1 text-xs text-muted">{dateTime(a.created_at)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <p className="text-xs text-muted">Export a month and match each UTR against your bank statement. A UTR can only be used once; the database rejects duplicates.</p>

      {/* QR Scanner & Payee Settings Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade">
          <div className="card w-full max-w-lg p-6 border border-gold/30 bg-[#061209] shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b hairline pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold">
                  <QrCode size={18} />
                </span>
                <div>
                  <h3 className="font-bold text-lg text-ink">Upload QR Scanner &amp; Payee</h3>
                  <p className="text-xs text-muted">Set what applicants see on the application fee payment step</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-muted hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveQr} className="space-y-4 text-sm">
              {/* QR Image Preview & Upload */}
              <div>
                <label className="block text-xs font-semibold text-muted mb-2">
                  UPI QR Scanner Image
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="size-28 shrink-0 rounded-xl bg-white p-2 flex items-center justify-center shadow-md">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="QR Preview"
                        className="size-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted text-center">No QR</span>
                    )}
                  </div>
                  <div className="space-y-2 text-center sm:text-left">
                    <p className="text-xs font-semibold text-ink">Upload custom scanner QR</p>
                    <p className="text-[0.72rem] text-muted">
                      PNG, JPG, SVG, WebP. Recommended square 400x400.
                    </p>
                    <label className="btn btn-outline btn-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                      <Upload size={13} /> Choose QR Image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleQrFile}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Payee Name */}
              <div>
                <label className="block text-xs font-semibold text-muted">
                  Payee Business Name
                  <input
                    type="text"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    placeholder="e.g. MoneyPayee Services"
                    className="mt-1 text-sm font-semibold"
                    required
                  />
                </label>
                <p className="mt-1 text-[0.7rem] text-muted">Shown above the QR code on the payment step.</p>
              </div>

              {/* Payee UPI ID */}
              <div>
                <label className="block text-xs font-semibold text-muted">
                  Payee UPI ID
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value.trim())}
                    placeholder="e.g. moneypayee@icici"
                    className="mt-1 font-mono text-sm"
                    required
                  />
                </label>
                <p className="mt-1 text-[0.7rem] text-muted">Applicants can copy this UPI ID to pay directly in any UPI app.</p>
              </div>

              {/* Fee Amount */}
              <div>
                <label className="block text-xs font-semibold text-muted">
                  Application Verification Fee (₹)
                  <input
                    type="number"
                    min={1}
                    value={fee}
                    onChange={(e) => setFee(Number(e.target.value))}
                    className="mt-1 font-mono text-sm"
                    required
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t hairline">
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQr}
                  className="btn btn-gold btn-sm font-bold"
                >
                  {savingQr ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save &amp; Update Live QR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
