"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronUp,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  ShieldCheck,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  TERMS_CLAUSES,
  TERMS_DOCUMENT_SUBTITLE,
  TERMS_DOCUMENT_TITLE,
  TERMS_PDF_PATH,
} from "@/config/terms-data";

export function TermsModal({ forceOpen = false }: { forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<1 | 2>(1);
  const [accepted, setAccepted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (!forceOpen && sessionStorage.getItem("mp_terms_accepted") === "1") {
        setAccepted(true);
        return;
      }
    } catch {}
    const timer = setTimeout(() => {
      setOpen(true);
    }, 350);
    return () => clearTimeout(timer);
  }, [forceOpen]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const changePage = (newPage: 1 | 2) => {
    setPage(newPage);
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleScrollUp = () => {
    if (contentRef.current) {
      if (contentRef.current.scrollTop > 50) {
        contentRef.current.scrollBy({ top: -240, behavior: "smooth" });
      } else if (page === 2) {
        changePage(1);
      }
    }
  };

  const handleScrollDown = () => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 50;
      if (atBottom && page === 1) {
        changePage(2);
      } else {
        contentRef.current.scrollBy({ top: 240, behavior: "smooth" });
      }
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-gold/30 bg-[#07140b]/90 px-4 py-2.5 text-xs font-semibold text-gold shadow-lg shadow-black/50 backdrop-blur-md transition-all hover:scale-105 hover:border-gold hover:bg-[#0c1f12]"
        aria-label="View Terms and Conditions"
      >
        <FileText size={15} />
        <span>Terms &amp; Conditions</span>
        <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
      </button>
    );
  }

  const currentClauses = TERMS_CLAUSES.filter((c) => c.page === page);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
    >
      <div
        className="relative flex flex-col w-full max-w-3xl max-h-[92vh] rounded-2xl border border-white/10 bg-[#06110a] text-ink shadow-2xl shadow-black/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b hairline bg-white/[0.03] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <ShieldCheck size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="chip border-gold/30 bg-gold/10 text-[0.68rem] font-bold uppercase tracking-wider text-gold">
                  Official Notice
                </span>
                <span className="text-xs text-muted">Terms &amp; Conditions</span>
              </div>
              <h2 id="terms-modal-title" className="display mt-0.5 text-base sm:text-lg font-bold">
                {TERMS_DOCUMENT_TITLE} — {TERMS_DOCUMENT_SUBTITLE}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={TERMS_PDF_PATH}
              download="MoneyPay_Terms_and_Conditions.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 btn btn-outline btn-xs"
              title="Download official signed PDF"
            >
              <Download size={13} />
              <span>PDF</span>
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink transition"
              aria-label="Close Terms Notification"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Page Switcher & Up/Down Arrows Control Bar */}
        <div className="flex items-center justify-between border-b hairline bg-white/[0.02] px-5 py-2.5 sm:px-6">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => changePage(1)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                page === 1
                  ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                  : "text-muted hover:bg-white/[0.05] hover:text-ink"
              }`}
            >
              Page 1: Clauses 1–7
            </button>
            <button
              type="button"
              onClick={() => changePage(2)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                page === 2
                  ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                  : "text-muted hover:bg-white/[0.05] hover:text-ink"
              }`}
            >
              Page 2: Clauses 8–12 &amp; Acceptance
            </button>
          </div>

          {/* Up & Down Arrows Navigation */}
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline text-[0.72rem] text-muted mr-1">
              Scroll / Page:
            </span>
            <button
              type="button"
              onClick={handleScrollUp}
              disabled={page === 1 && (contentRef.current?.scrollTop ?? 0) <= 10}
              className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-ink hover:bg-white/10 hover:border-gold/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Scroll Up / Previous Section"
              aria-label="Previous Page or Scroll Up"
            >
              <ChevronUp size={18} />
            </button>
            <button
              type="button"
              onClick={handleScrollDown}
              className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-ink hover:bg-white/10 hover:border-gold/30 transition"
              title="Scroll Down / Next Section"
              aria-label="Next Page or Scroll Down"
            >
              <ChevronDown size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 space-y-5 text-sm leading-relaxed text-ink-2"
        >
          {page === 1 && (
            <div className="rounded-xl border border-gold/25 bg-gradient-to-r from-gold/10 via-emerald-500/5 to-transparent p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-gold shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm">
                  <p className="font-semibold text-ink">
                    Important: Please review before proceeding
                  </p>
                  <p className="mt-0.5 text-muted">
                    This document sets out the terms of application assistance. As highlighted in Clause 2, application and service fees are strictly non-refundable once processing commences.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentClauses.map((clause) => (
            <article
              key={clause.id}
              className={`rounded-xl border p-4 sm:p-5 transition ${
                clause.important
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-bold text-base sm:text-lg text-ink">
                  {clause.title}
                </h3>
                {clause.important && (
                  <span className="chip border-emerald-500/30 bg-emerald-500/10 text-[0.68rem] font-semibold text-emerald-400">
                    Key Clause
                  </span>
                )}
              </div>

              {clause.intro && (
                <p className="mt-2 text-ink font-medium leading-relaxed">
                  {clause.intro}
                </p>
              )}

              {clause.body && (
                <p className="mt-2 leading-relaxed whitespace-pre-line text-ink-2">
                  {clause.body}
                </p>
              )}

              {clause.bullets && clause.bullets.length > 0 && (
                <ul className="mt-3 space-y-2 pl-2">
                  {clause.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 size-1.5 rounded-full bg-gold shrink-0" />
                      <span className="text-ink-2">{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {clause.outro && (
                <p className="mt-3 border-t hairline pt-3 text-xs sm:text-sm text-muted italic">
                  {clause.outro}
                </p>
              )}
            </article>
          ))}

          {page === 2 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs sm:text-sm text-emerald-300 space-y-3">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} />
                <span>Electronic Acceptance</span>
              </div>
              <p className="text-ink-2 leading-relaxed">
                Please confirm below that you have read and agree to these Terms and Conditions before continuing.
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-black/25 p-3 text-ink">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 size-4 accent-emerald-500 rounded"
                />
                <span className="text-xs sm:text-sm font-semibold leading-snug">
                  I have read and accept the Terms and Conditions.
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Bottom Actions Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t hairline bg-white/[0.03] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-xs text-muted">
              Page <strong>{page}</strong> of <strong>2</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => changePage(1)}
                disabled={page === 1}
                className="btn btn-ghost btn-xs text-xs disabled:opacity-30"
              >
                <ChevronUp size={14} /> Page 1
              </button>
              <button
                type="button"
                onClick={() => changePage(2)}
                disabled={page === 2}
                className="btn btn-ghost btn-xs text-xs disabled:opacity-30"
              >
                Page 2 <ChevronDown size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Link
              href="/terms"
              onClick={() => setOpen(false)}
              className="btn btn-outline btn-sm text-xs"
            >
              Full Terms Page <ExternalLink size={13} />
            </Link>
            <button
              type="button"
              disabled={page === 2 && !accepted}
              onClick={() => {
                if (page === 1) {
                  changePage(2);
                } else {
                  try {
                    sessionStorage.setItem("mp_terms_accepted", "1");
                  } catch {}
                  setOpen(false);
                }
              }}
              className="btn btn-primary btn-sm text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {page === 1 ? (
                <>Next Page &rarr;</>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Accept &amp; Continue
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
