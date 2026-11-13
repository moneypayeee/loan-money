"use client";

/** Small building blocks shared by the admin tabs, so every tab looks and behaves the same. */
import { Download, Search } from "lucide-react";

export function Stat({
  label,
  value,
  foot,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string;
  foot?: string;
  tone?: "default" | "ok" | "warn" | "bad" | "gold";
  onClick?: () => void;
}) {
  const color = { default: "text-ink", ok: "text-ok", warn: "text-warn", bad: "text-bad", gold: "text-gold" }[tone];
  const body = (
    <>
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted sm:text-[0.7rem]">{label}</p>
      <p className={`display mt-2 text-2xl leading-none sm:text-[1.9rem] ${color}`}>{value}</p>
      {foot && <p className="mt-2 text-xs text-muted">{foot}</p>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="card p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-5">
      {body}
    </button>
  ) : (
    <div className="card p-4 sm:p-5">{body}</div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  grid = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string, number?])[];
  label: string;
  /** Equal-width buttons in two columns instead of one scrolling row (for narrow columns). */
  grid?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`gap-1 rounded-xl border hairline bg-white/[0.03] p-1 ${grid ? "grid grid-cols-2" : "flex overflow-x-auto [scrollbar-width:none]"}`}
    >
      {options.map(([v, text, count]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${value === v ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
        >
          {text}
          {count != null && <span className={`ml-1.5 text-xs ${value === v ? "text-paper/60" : "text-faint"}`}>{count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full lg:w-80">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <input className="!pl-10" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function ExportButton({ onClick, disabled, label = "Export CSV" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={onClick} disabled={disabled}>
      <Download size={14} /> {label}
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-10 text-center text-sm text-muted sm:p-12">{children}</p>;
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "gold" | "muted" | "info"; children: React.ReactNode }) {
  const cls = {
    ok: "bg-ok-soft text-ok border-ok/15",
    warn: "bg-warn-soft text-warn border-warn/15",
    bad: "bg-bad-soft text-bad border-bad/15",
    gold: "bg-gold-soft text-gold-ink border-gold/25",
    muted: "bg-white/[0.05] text-ink-2 border-white/10",
    info: "bg-brand-soft text-brand-ink border-brand/15",
  }[tone];
  return <span className={`chip whitespace-nowrap ${cls}`}>{children}</span>;
}

/** Thin progress bar (EMIs paid of total). */
export function Bar({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total}>
      <span className="block h-full rounded-full bg-gradient-to-r from-brand to-gold" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** "1 EMI", "3 EMIs" */
export const plural = (n: number, word: string, many = word + "s") => `${n.toLocaleString("en-IN")} ${n === 1 ? word : many}`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
