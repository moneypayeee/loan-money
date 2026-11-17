"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download,
  FileCheck,
  FileText,
  Gavel,
  ShieldAlert,
} from "lucide-react";
import {
  TERMS_CLAUSES,
  TERMS_DOCUMENT_SUBTITLE,
  TERMS_DOCUMENT_TITLE,
  TERMS_PDF_PATH,
} from "@/config/terms-data";

export function TermsDocumentViewer() {
  const [activePage, setActivePage] = useState<1 | 2>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const goToPage = (page: 1 | 2) => {
    setActivePage(page);
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleArrowUp = () => {
    if (activePage === 2) {
      goToPage(1);
    } else if (containerRef.current) {
      window.scrollBy({ top: -300, behavior: "smooth" });
    }
  };

  const handleArrowDown = () => {
    if (activePage === 1) {
      goToPage(2);
    } else if (containerRef.current) {
      window.scrollBy({ top: 300, behavior: "smooth" });
    }
  };

  const pageClauses = TERMS_CLAUSES.filter((c) => c.page === activePage);

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Top Document Header Card */}
      <div className="card overflow-hidden p-6 sm:p-8 border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip border-amber-500/30 bg-amber-50 text-amber-800 font-bold uppercase tracking-wider text-[0.7rem]">
                Official Legal Document
              </span>
              <span className="chip border-emerald-600/30 bg-emerald-50 text-emerald-700 text-[0.7rem]">
                2 Pages · 12 Clauses
              </span>
            </div>
            <h2 className="display text-2xl sm:text-3xl lg:text-4xl text-slate-900">
              {TERMS_DOCUMENT_TITLE}
            </h2>
            <p className="text-sm sm:text-base font-semibold tracking-wide text-amber-700">
              {TERMS_DOCUMENT_SUBTITLE}
            </p>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
              Complete, authoritative terms governing loan application assistance, document verification, and the non-refundable verification fee.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={TERMS_PDF_PATH}
              download="MoneyPay_Terms_and_Conditions.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-gold btn-md font-bold shadow-sm"
            >
              <Download size={16} /> Download Official PDF
            </a>
          </div>
        </div>
      </div>

      {/* Interactive Navigation & Up/Down Arrows Control Bar */}
      <div className="sticky top-20 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3.5 backdrop-blur-xl shadow-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToPage(1)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
              activePage === 1
                ? "border border-emerald-600/30 bg-emerald-50 text-emerald-800 shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <FileText size={15} />
            <span>Page 1 (Clauses 1–7)</span>
          </button>

          <button
            type="button"
            onClick={() => goToPage(2)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
              activePage === 2
                ? "border border-emerald-600/30 bg-emerald-50 text-emerald-800 shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <FileCheck size={15} />
            <span>Page 2 (Clauses 8–12 &amp; Acceptance)</span>
          </button>
        </div>

        {/* Up & Down Arrows for quick navigation */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1">
            Navigate:
          </span>
          <button
            type="button"
            onClick={handleArrowUp}
            disabled={activePage === 1}
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-amber-500/40 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Move to Previous Page / Section"
            aria-label="Previous Page"
          >
            <ChevronUp size={16} className="text-amber-700" />
            <span className="hidden sm:inline">Up (Page 1)</span>
          </button>

          <button
            type="button"
            onClick={handleArrowDown}
            disabled={activePage === 2}
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-amber-500/40 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Move to Next Page / Section"
            aria-label="Next Page"
          >
            <span className="hidden sm:inline">Down (Page 2)</span>
            <ChevronDown size={16} className="text-amber-700" />
          </button>
        </div>
      </div>

      {/* Page Content Display */}
      <div className="space-y-5">
        {activePage === 1 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm">
            <div className="flex items-start gap-3.5">
              <ShieldAlert size={22} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Document Overview — Page 1 of 2
                </h3>
                <p className="mt-1 text-slate-700 leading-relaxed">
                  Contains Clause 1 through Clause 7 covering the application assistance fee, the strict non-refundable policy, credit approval disclaimers, and applicant document responsibilities.
                </p>
              </div>
            </div>
          </div>
        )}

        {activePage === 2 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm">
            <div className="flex items-start gap-3.5">
              <Gavel size={22} className="text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Document Overview — Page 2 of 2
                </h3>
                <p className="mt-1 text-slate-700 leading-relaxed">
                  Contains Clause 8 through Clause 12 covering privacy, cancellation, limitation of liability, governing jurisdiction (Bengaluru, Karnataka), and the applicant&apos;s legal declaration.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Clause Cards */}
        <div className="grid gap-5">
          {pageClauses.map((c) => {
            const isHighlight = c.important;
            return (
              <article
                key={c.id}
                id={`clause-${c.id}`}
                className={`card group relative overflow-hidden p-6 sm:p-8 transition-all ${
                  isHighlight
                    ? "border-emerald-300 bg-emerald-50/40 shadow-sm"
                    : "border-slate-200 bg-white shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-700">
                      Section {c.id < 10 ? `0${c.id}` : c.id}
                    </span>
                    <h3 className="display text-xl sm:text-2xl text-slate-900">
                      {c.title}
                    </h3>
                  </div>
                  {isHighlight && (
                    <span className="chip border-amber-500/30 bg-amber-50 text-amber-800 text-xs font-bold">
                      Essential Notice
                    </span>
                  )}
                </div>

                {c.intro && (
                  <p className="mt-4 font-semibold text-slate-900 text-base leading-relaxed">
                    {c.intro}
                  </p>
                )}

                {c.body && (
                  <p className="mt-3 text-slate-700 text-sm sm:text-[0.95rem] leading-relaxed whitespace-pre-line">
                    {c.body}
                  </p>
                )}

                {c.bullets && c.bullets.length > 0 && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                    <ul className="space-y-2.5">
                      {c.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                          <span className="mt-1.5 size-2 rounded-full bg-amber-600 shrink-0" />
                          <span className="leading-relaxed">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.outro && (
                  <p className="mt-4 border-t border-slate-200 pt-3.5 text-xs sm:text-sm text-slate-600 italic leading-relaxed">
                    {c.outro}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {/* Bottom Pagination & Download Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={activePage === 1}
              className="btn btn-outline btn-sm text-xs disabled:opacity-30"
            >
              <ChevronUp size={15} /> Page 1: Clauses 1–7
            </button>
            <button
              type="button"
              onClick={() => goToPage(2)}
              disabled={activePage === 2}
              className="btn btn-outline btn-sm text-xs disabled:opacity-30"
            >
              Page 2: Clauses 8–12 <ChevronDown size={15} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={TERMS_PDF_PATH}
              download="MoneyPay_Terms_and_Conditions.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm text-xs text-amber-700 hover:text-amber-900"
            >
              <Download size={14} /> Download PDF
            </a>
            <Link href="/apply" className="btn btn-gold btn-sm text-xs font-bold">
              Apply Now <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
