"use client";

import { useState } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { useSettings } from "@/lib/settings-context";
import { Notice, Spinner } from "../ui";
import type { User } from "@supabase/supabase-js";
import { ApplicationWizard } from "./application-wizard";

export function ApplicantPortal() {
  const { user, ready } = useSession();
  const { site, payment, disclosed, loading: settingsLoading } = useSettings();
  const [justSubmitted, setJustSubmitted] = useState<string | null>(null);
  const [keepGuestForm, setKeepGuestForm] = useState(false);

  const waDigits = (site?.support_phone || "").replace(/\D/g, "");
  const waTarget = waDigits.length >= 10 ? (waDigits.length === 10 ? `91${waDigits}` : waDigits) : "";
  const waHref = waTarget
    ? `https://wa.me/${waTarget}?text=${encodeURIComponent(`Hi MoneyPayee team, I submitted my application${justSubmitted ? ` (Ref: ${justSubmitted})` : ""} and need assistance.`)}`
    : `https://wa.me/?text=${encodeURIComponent(`Hi MoneyPayee team, I submitted my application${justSubmitted ? ` (Ref: ${justSubmitted})` : ""} and need assistance.`)}`;

  if (!supabase) {
    return (
      <main className="shell py-8 sm:py-10">
        <div className="mb-6">
          <span className="eyebrow eyebrow-light">Demo mode</span>
          <h1 className="display mt-5 text-4xl sm:text-5xl">
            <span className="text-gradient">Let&rsquo;s get you</span> <span className="serif text-champagne">started.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted">Preview of the application form. Submitting is disabled until Supabase is connected.</p>
        </div>
        <ApplicationWizard user={{ id: "demo" } as User} demo onSubmitted={() => {}} />
      </main>
    );
  }

  if (!ready || settingsLoading) return <Spinner />;

  const open = disclosed && Boolean(payment?.qr_path && payment.upi_id && payment.payee_name);

  if (justSubmitted && !keepGuestForm) {
    return (
      <main className="shell py-12 sm:py-16">
        <div className="mx-auto max-w-2xl card card-glow border-ok/30 bg-ok-soft/30 p-7 sm:p-10 space-y-5 animate-rise">
          <div className="flex items-start gap-4">
            <CheckCircle2 size={38} className="shrink-0 text-ok mt-0.5" />
            <div>
              <span className="chip border-ok/30 bg-ok/15 text-ok text-xs font-bold uppercase tracking-wider">
                Application Submitted
              </span>
              <h1 className="display mt-2 text-2xl sm:text-3xl text-ink">
                Thank you! Reference: <span className="font-mono text-gold">{justSubmitted}</span>
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Your documents and ₹299 verification fee have been received. Our team will verify your details and forward your application to the banking/lending partner. They will contact you directly regarding your loan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-md font-bold bg-[#25D366]/20 border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/30"
            >
              <MessageCircle size={16} /> Any issues? Chat on WhatsApp
            </a>
            <button
              type="button"
              onClick={() => setJustSubmitted(null)}
              className="btn btn-outline btn-md"
            >
              Submit another application
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="shell py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">New application</span>
          <h1 className="display mt-5 text-4xl sm:text-5xl">
            <span className="text-gradient">Let&rsquo;s get you</span> <span className="serif text-champagne">started.</span>
          </h1>
          <p className="mt-2 text-sm text-muted">Takes about five minutes. Keep your ID, Aadhaar, PAN and UPI app ready.</p>
        </div>
      </div>
      {!open ? (
        <Notice tone="warn">
          {disclosed ? "Payment details are being set up. Please check back shortly." : "Applications are closed until the lending partner’s details are published. Please check back soon."}
        </Notice>
      ) : (
        <ApplicationWizard
          user={user}
          onAccountCreating={() => setKeepGuestForm(true)}
          onSubmitted={(ref) => {
            setKeepGuestForm(false);
            setJustSubmitted(ref);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </main>
  );
}
