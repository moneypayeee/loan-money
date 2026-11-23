"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, FileCheck2, X } from "lucide-react";

const DISMISSED_KEY = "mp_quick_application_dismissed";

export function QuickApplicationModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {}

    const timer = window.setTimeout(() => dialogRef.current?.showModal(), 350);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="quick-application-title"
      onCancel={dismiss}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl border border-gold/30 bg-[#0a140e] p-0 text-ink shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      <div className="relative isolate border-b border-gold/15 bg-[radial-gradient(ellipse_at_top_right,#214c34_0%,transparent_65%),linear-gradient(145deg,#14291d,#0b1810)] px-5 pb-6 pt-7 sm:px-8 sm:pb-8">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close quick application"
          className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/15 bg-black/20 text-ink hover:bg-white/15"
        >
          <X size={19} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-4 pr-10">
          <span className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-gold/60 bg-gold/10 text-gold" aria-label="Five minutes">
            <span className="text-center" aria-hidden="true">
              <span className="display block text-3xl font-bold leading-none">5</span>
              <span className="block text-[0.65rem] font-bold uppercase tracking-wider">min</span>
            </span>
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gold">Quick application</p>
            <p className="mt-1 text-sm text-ink-2">About five minutes to apply</p>
          </div>
        </div>

        <h2 id="quick-application-title" className="display mt-5 max-w-sm text-3xl leading-tight sm:text-4xl">
          Online, with no paper forms.
        </h2>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-8 sm:py-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <FileCheck2 size={20} aria-hidden="true" />
          </span>
          <p className="text-sm leading-relaxed text-ink-2">
            The form does not ask for a CIBIL score. Upload your ID and address proof online.
            Any additional documents depend on your applicant category.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-gold/20 bg-gold/[0.07] p-3.5">
          <Clock3 size={21} className="shrink-0 text-gold" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Loan in 48 hours</p>
            <p className="mt-0.5 text-sm text-ink-2">The lender makes the final decision.</p>
          </div>
        </div>

        <Link href="/apply" onClick={dismiss} className="btn btn-gold w-full justify-center">
          Apply now <ArrowRight size={17} aria-hidden="true" />
        </Link>

        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-sm text-gold">
          <Link href="/terms" onClick={dismiss} className="underline underline-offset-4 hover:text-ink">
            Terms &amp; Conditions
          </Link>
          <Link href="/privacy" onClick={dismiss} className="underline underline-offset-4 hover:text-ink">
            Privacy Policy
          </Link>
        </div>
      </div>
    </dialog>
  );
}
