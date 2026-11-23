import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  TERMS_CLAUSES,
  TERMS_DOCUMENT_SUBTITLE,
  TERMS_DOCUMENT_TITLE,
} from "@/config/terms-data";

export function TermsDocumentViewer() {
  return (
    <div className="space-y-6">
      {/* Top Document Header Card */}
      <div className="card overflow-hidden p-6 sm:p-8 border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip border-amber-500/30 bg-amber-50 text-amber-800 font-bold uppercase tracking-wider text-[0.7rem]">
                Official Legal Document
              </span>
              <span className="chip border-emerald-600/30 bg-emerald-50 text-emerald-700 text-[0.7rem]">
                12 Clauses
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
        </div>
      </div>

      {/* Clause Cards */}
      <div className="grid gap-5">
        {TERMS_CLAUSES.map((c) => {
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

      <div className="flex justify-center sm:justify-end">
        <Link href="/apply" className="btn btn-gold btn-sm text-xs font-bold">
          Apply Now <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
