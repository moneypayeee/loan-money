"use client";

import Link from "next/link";
import Image from "next/image";
import { AlertCircle, CheckCircle2, Clock3, Info, Loader2, RotateCcw, XCircle, X } from "lucide-react";
import type { ApplicationStatus } from "@/lib/types";

export function Logo({
  dark = true,
  compact = false,
  className = "",
}: {
  dark?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 transition-opacity hover:opacity-95 ${className}`}
      aria-label="MoneyPayee home"
    >
      {compact ? (
        <Image
          src="/logo-icon.png"
          alt="MoneyPayee"
          width={42}
          height={36}
          priority
          className="h-9 w-auto object-contain"
        />
      ) : (
        <Image
          src="/logo.png"
          alt="MoneyPayee"
          width={154}
          height={38}
          priority
          className="h-9 w-auto object-contain"
        />
      )}
    </Link>
  );
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  if (status === "accepted")
    return (
      <span className="chip bg-ok-soft text-ok border-ok/15">
        <CheckCircle2 size={13} /> Approved
      </span>
    );
  if (status === "rejected")
    return (
      <span className="chip bg-bad-soft text-bad border-bad/15">
        <XCircle size={13} /> Not approved
      </span>
    );
  return (
    <span className="chip bg-warn-soft text-warn border-warn/15">
      <Clock3 size={13} /> Under review
    </span>
  );
}

export function Notice({
  tone = "info",
  children,
  onClose,
}: {
  tone?: "info" | "ok" | "bad" | "warn";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const styles = {
    info: "bg-brand-soft text-brand-ink border-brand/15",
    ok: "bg-ok-soft text-ok border-ok/20",
    bad: "bg-bad-soft text-bad border-bad/20",
    warn: "bg-warn-soft text-warn border-warn/20",
  }[tone];
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? AlertCircle : tone === "warn" ? AlertCircle : Info;
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium animate-fade ${styles}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1 leading-relaxed">{children}</div>
      {onClose && (
        <button type="button" aria-label="Dismiss" onClick={onClose} className="opacity-60 hover:opacity-100">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-20 text-sm font-medium text-muted">
      <Loader2 className="animate-spin text-brand" size={28} />
      {label}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id + "-error"} className="field-error">
      <AlertCircle size={13} className="shrink-0" /> {message}
    </p>
  );
}

export function SetupRequired() {
  return (
    <div className="shell py-20">
      <div className="card mx-auto max-w-xl p-8 text-center">
        <span className="eyebrow eyebrow-light">Setup required</span>
        <h1 className="display mt-3 text-3xl">Connect Supabase to continue</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Add <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
          <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">.env.local</code>, run{" "}
          <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">supabase/schema.sql</code>, then restart the dev server.
        </p>
      </div>
    </div>
  );
}
