"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  BadgeIndianRupee,
  Check,
  CheckCircle2,
  CircleCheckBig,
  Copy,
  CreditCard,
  FileCheck2,
  Gift,
  Loader2,
  QrCode,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSettings } from "@/lib/settings-context";
import { errorText, rupees } from "@/lib/format";
import { EMAIL_RE, normalizePhone, phoneToAuthEmail } from "@/lib/phone-auth";
import { CATEGORIES, FEE, IDENTITY_TYPES } from "@/lib/types";
import { STEP_FIELDS, firstStepWithError, validateApplication, type ApplicationInput, type Errors } from "@/lib/application-validation";
import { FileDrop, IMAGE_TYPES } from "../file-drop";
import { LOAN_ESTIMATE, PAYMENT, SITE } from "@/config/site";
import { emi } from "@/lib/loan-math";
import { FieldError, Notice } from "../ui";
import { checkApplicantExists, checkReferralCode, normalizeReferralCode } from "@/lib/referral-system";

const REF_KEY = "mp-referral-code";
const DUP_PHONE = `An application with this mobile number already exists. Please contact us at ${SITE.support_email} for help.`;
const DUP_EMAIL = `An application with this email ID already exists. Please contact us at ${SITE.support_email} for help.`;

const STEPS = [
  { title: "About you", icon: UserRound },
  { title: "Documents", icon: FileCheck2 },
  { title: "Payment", icon: QrCode },
  { title: "Review", icon: CircleCheckBig },
];

const AMOUNTS = [10000, 25000, 50000, 100000];

type Files = {
  identity: File | null;
  identity_back: File | null;
  driving_licence: File | null;
  aadhaar: File | null;
  aadhaar_back: File | null;
  pan: File | null;
  address: File | null;
  student: File | null;
  proof: File | null;
};

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };

export function ApplicationWizard({
  user,
  onSubmitted,
  onAccountCreating,
  demo = false,
}: {
  /** null = not signed in: the account is created from the mobile number + a password on the last step. */
  user: User | null;
  onSubmitted: (ref: string) => void;
  /** Called just before a new account is created, so the page keeps this form open while signing in. */
  onAccountCreating?: () => void;
  demo?: boolean;
}) {
  const { site, payment, qrUrl } = useSettings();
  const fee = payment?.fee !== undefined ? payment.fee : FEE;
  const guest = !user && !demo;
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [serverError, setServerError] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [copied, setCopied] = useState(false);
  const [referralCode, setReferralCode] = useState<string>("");
  const [refStatus, setRefStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [checkingDup, setCheckingDup] = useState(false);

  // Referral code from the shared link (?ref=CODE); remembered for this browser tab so a reload keeps it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let ref = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
    try {
      if (ref) sessionStorage.setItem(REF_KEY, ref);
      else ref = normalizeReferralCode(sessionStorage.getItem(REF_KEY));
    } catch {}
    if (ref) setReferralCode(ref);
  }, []);

  // Check the code exists (debounced while typing).
  useEffect(() => {
    if (!referralCode || referralCode.length < 4) {
      setRefStatus("idle");
      return;
    }
    if (demo) {
      setRefStatus("valid");
      return;
    }
    setRefStatus("checking");
    let alive = true;
    const t = setTimeout(() => {
      void checkReferralCode(referralCode).then((ok) => {
        if (alive) setRefStatus(ok === false ? "invalid" : ok ? "valid" : "idle");
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [referralCode, demo]);
  const [payMethod, setPayMethod] = useState<"razorpay" | "qr">("razorpay");
  const [razorpayLoading, setRazorpayLoading] = useState(false);
  const [razorpayError, setRazorpayError] = useState("");
  const [razorpayPaymentId, setRazorpayPaymentId] = useState<string | null>(null);

  const loadRazorpayScript = () => {
    return new Promise<boolean>((resolve) => {
      if (typeof window !== "undefined" && (window as any).Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayPayment = async () => {
    setRazorpayLoading(true);
    setRazorpayError("");
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setRazorpayError("Could not connect to payment gateway. Please scan the QR code instead.");
        setRazorpayLoading(false);
        return;
      }

      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_name: v.full_name,
          phone: v.phone,
        }),
      });

      const orderData = await res.json();
      if (!res.ok || !orderData.orderId) {
        setRazorpayError(orderData.error || "Failed to initialize Razorpay payment. Please use QR code.");
        setRazorpayLoading(false);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        name: "MoneyPayee",
        description: "Application Verification Fee",
        image: "/logo-icon.png",
        order_id: orderData.orderId,
        prefill: {
          name: v.full_name,
          contact: v.phone,
          email: contactEmail || undefined,
        },
        theme: {
          color: "#16a34a",
        },
        handler: async function (response: any) {
          // Confirm the payment on the server (signature + status + amount) before accepting it.
          setRazorpayLoading(true);
          let verify: { verified?: boolean; error?: string } = {};
          try {
            const vr = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            verify = await vr.json().catch(() => ({}));
          } catch {
            verify = { error: "Could not confirm your payment. Please check your connection and try again." };
          }
          setRazorpayLoading(false);
          if (!verify.verified) {
            setRazorpayError(
              `${verify.error || "Payment could not be verified."} Payment ID: ${response.razorpay_payment_id || "—"}`
            );
            return;
          }

          const payId = response.razorpay_payment_id;
          setRazorpayPaymentId(payId);
          set("transaction_id", payId);

          // Generate digital verified receipt screenshot
          const canvas = document.createElement("canvas");
          canvas.width = 600;
          canvas.height = 360;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#050f08";
            ctx.fillRect(0, 0, 600, 360);
            ctx.fillStyle = "#16a34a";
            ctx.fillRect(0, 0, 600, 8);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 22px sans-serif";
            ctx.fillText("MoneyPayee Payment Receipt", 40, 50);
            ctx.font = "14px sans-serif";
            ctx.fillStyle = "#a1a1aa";
            ctx.fillText("Razorpay Verified Online Payment", 40, 75);
            ctx.fillStyle = "#22c55e";
            ctx.font = "bold 38px sans-serif";
            ctx.fillText(`₹${Math.round(Number(orderData.amount) / 100) || fee}`, 40, 135);
            ctx.fillStyle = "#ffffff";
            ctx.font = "15px sans-serif";
            ctx.fillText(`Payment ID: ${payId}`, 40, 185);
            ctx.fillText(`Applicant: ${v.full_name}`, 40, 215);
            ctx.fillText(`Order ID: ${orderData.orderId}`, 40, 245);
            ctx.fillText(`Date: ${new Date().toLocaleString("en-IN")}`, 40, 275);
            ctx.fillStyle = "#16a34a";
            ctx.font = "bold 15px sans-serif";
            ctx.fillText("STATUS: VERIFIED / SUCCESS", 40, 315);
          }
          canvas.toBlob((blob) => {
            const file = new File([blob || new Blob()], `razorpay-${payId}.png`, { type: "image/png" });
            setFile("proof", file, "proof");
          }, "image/png");
        },
        modal: {
          ondismiss: function () {
            setRazorpayLoading(false);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        setRazorpayError(response.error.description || "Payment failed. Please try again or scan QR.");
        setRazorpayLoading(false);
      });
      rzp.open();
    } catch (err: any) {
      setRazorpayError(err?.message || "Payment service temporarily unavailable. Please scan the QR code.");
    } finally {
      setRazorpayLoading(false);
    }
  };
  const [tenure, setTenure] = useState(12); // only for the EMI estimate; the lender sets the real tenure
  const [files, setFiles] = useState<Files>({
    identity: null,
    identity_back: null,
    driving_licence: null,
    aadhaar: null,
    aadhaar_back: null,
    pan: null,
    address: null,
    student: null,
    proof: null,
  });
  const [v, setV] = useState({
    full_name: "",
    phone: "",
    alt_phone: "",
    email: "",
    dob: "",
    category: "Employed",
    requested_amount: "25000",
    address: "",
    city: "",
    state: "",
    pincode: "",
    identity_type: "Voter ID",
    identity_last4: "",
    institution: "",
    kyc_consent: false,
    transaction_id: "",
    refund_upi_id: "",
    payment_consent: false,
  });

  const input: ApplicationInput = useMemo(
    () => ({
      ...v,
      identity_type: v.category === "Driver" ? "Driving licence" : v.identity_type,
      files: {
        identity: !!files.identity,
        identity_back: !!files.identity_back,
        driving_licence: !!files.driving_licence,
        aadhaar: !!files.aadhaar || !!files.address,
        aadhaar_back: !!files.aadhaar_back,
        pan: !!files.pan,
        address: !!files.aadhaar || !!files.address,
        student: !!files.student,
        proof: !!files.proof,
      },
    }),
    [v, files],
  );

  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => {
    setV((p) => ({ ...p, [k]: value }));
    if (errors[k as string]) setErrors(({ [k as string]: _drop, ...rest }) => rest);
  };
  const setFile = (k: keyof Files, f: File | null, errKey: string) => {
    setFiles((p) => ({ ...p, [k]: f }));
    if (errors[errKey]) setErrors(({ [errKey]: _drop, ...rest }) => rest);
  };

  function stepErrors(i: number) {
    const all = validateApplication(input);
    return Object.fromEntries(Object.entries(all).filter(([k]) => STEP_FIELDS[i].includes(k)));
  }

  async function next() {
    const e = stepErrors(step);
    // Stop a repeat applicant on the first step, before they pay the fee.
    if (step === 0 && !demo && !Object.keys(e).length) {
      setCheckingDup(true);
      const dup = await checkApplicantExists(v.phone.trim(), v.email.trim());
      setCheckingDup(false);
      if (dup === "phone") e.phone = DUP_PHONE;
      else if (dup === "email") e.email = DUP_EMAIL;
    }
    setErrors(e);
    if (Object.keys(e).length) return focusFirst(e);
    setStep((s) => Math.min(s + 1, 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function focusFirst(e: Errors) {
    const key = Object.keys(e)[0];
    setTimeout(() => {
      const el = document.getElementById(key);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement | null)?.focus?.();
    }, 30);
  }

  async function submit() {
    setServerError("");
    const all = validateApplication(input);
    if (Object.keys(all).length) {
      setErrors(all);
      const s = firstStepWithError(all);
      if (s !== null) setStep(s);
      return focusFirst(all);
    }
    if (demo) return setServerError("Demo mode: everything checks out, but submitting needs Supabase. Add your keys to .env.local to go live.");
    if (!supabase || !payment?.qr_path) return setServerError("Payments are not configured yet. Please try again later.");
    setBusy(true);
    try {
      // Every application gets its OWN hidden account (there is no user-facing login).
      // Never reuse a session left in this browser by an earlier applicant: that would file this
      // person under the earlier applicant's account and their referral would count as a self-referral.
      let uid: string | undefined;
      {
        setProgress("Preparing your submission…");
        onAccountCreating?.();
        if (user) await supabase.auth.signOut({ scope: "local" });
        const internalEmail = `${normalizePhone(v.phone)}-${crypto.randomUUID().slice(0, 8)}@internal.moneypay.local`;
        const internalPw = `${crypto.randomUUID()}Aa1!`;
        const contactEmailFinal = v.email.trim() || null;
        const su = await supabase.auth.signUp({
          email: internalEmail,
          password: internalPw,
          options: { data: { phone: normalizePhone(v.phone), full_name: v.full_name.trim(), alt_phone: v.alt_phone.trim() || null, contact_email: contactEmailFinal } },
        });
        if (su.error) throw su.error;
        if (!su.data.session || !su.data.user) {
          throw new Error("Submission is waiting for email confirmation in Supabase. Ask the site owner to turn off “Confirm email” in Supabase.");
        }
        uid = su.data.user.id;
      }
      const upload = async (bucket: string, f: File | null) => {
        if (!f) return null;
        const path = `${uid}/${crypto.randomUUID()}.${EXT[f.type] ?? "bin"}`;
        const { error } = await supabase!.storage.from(bucket).upload(path, f, { contentType: f.type, upsert: false });
        if (error) throw error;
        return path;
      };
      setProgress("Uploading documents…");
      const [identity_path, identity_back_path, driving_path, aadhaar_path, aadhaar_back_path, pan_path, student_path] = await Promise.all([
        upload("kyc-documents", files.identity),
        upload("kyc-documents", files.identity_back),
        upload("kyc-documents", files.driving_licence),
        upload("kyc-documents", files.aadhaar || files.address),
        upload("kyc-documents", files.aadhaar_back),
        upload("kyc-documents", files.pan),
        upload("kyc-documents", v.category === "Student" ? files.student : null),
      ]);
      // Drivers: the database requires the driving licence as their identity document.
      const isDriver = v.category === "Driver";
      const resolvedIdentityPath = isDriver ? driving_path : identity_path || driving_path || aadhaar_path;
      // Back side belongs to the ID card; every file is also saved under its own name below.
      const resolvedIdentityBackPath = !isDriver && identity_path ? identity_back_path : null;
      const resolvedIdentityType = isDriver || (!identity_path && driving_path) ? "Driving licence" : "Voter ID";
      const resolvedLast4 = /^[A-Za-z0-9]{4}$/.test(v.identity_last4.trim()) ? v.identity_last4.trim().toUpperCase() : "0000";
      setProgress("Uploading payment screenshot…");
      const proof_path = await upload("payment-proofs", files.proof);
      setProgress("Submitting application…");
      const { data, error } = await supabase.rpc("submit_loan_application", {
        p_full_name: v.full_name.trim(),
        p_phone: v.phone.trim(),
        p_category: v.category,
        p_requested_amount: Number(v.requested_amount),
        p_transaction_id: v.transaction_id.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
        p_proof_path: proof_path,
        p_expected_qr: payment.qr_path,
        p_refund_upi_id: v.refund_upi_id.trim(),
        p_kyc: {
          dob: v.dob,
          address: v.address.trim(),
          city: v.city.trim(),
          state: v.state.trim(),
          pincode: v.pincode.trim(),
          identity_type: resolvedIdentityType,
          identity_last4: resolvedLast4,
          institution: v.institution.trim(),
          identity_path: resolvedIdentityPath,
          identity_back_path: resolvedIdentityBackPath,
          address_path: aadhaar_path,
          aadhaar_path,
          aadhaar_back_path,
          pan_path,
          driving_path,
          id_card_path: identity_path,
          id_card_back_path: identity_back_path,
          alt_phone: v.alt_phone.trim(),
          email: v.email.trim(),
          student_path,
          consent: true,
        },
        p_referral_code: referralCode && refStatus !== "invalid" ? referralCode : null,
      });
      if (error) throw error;
      onSubmitted((data as { ref_code: string }).ref_code);
    } catch (err) {
      setServerError(errorText(err));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const annualRate = payment?.emi_annual_rate ?? PAYMENT.emi_annual_rate;
  const estimate = validAmount(Number(v.requested_amount)) ? emi(Number(v.requested_amount), annualRate, tenure) : 0;
  const f = (k: string) => ({ id: k, "aria-invalid": Boolean(errors[k]), "aria-describedby": errors[k] ? k + "-error" : undefined });

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
      <div className="card overflow-hidden">
        {/* Stepper */}
        <ol className="grid grid-cols-4 border-b hairline bg-white/[0.02]">
          {STEPS.map(({ title, icon: Icon }, i) => {
            const state = i < step ? "done" : i === step ? "active" : "todo";
            return (
              <li key={title} className="relative">
                <button
                  type="button"
                  disabled={i > step || busy}
                  onClick={() => setStep(i)}
                  className={`flex w-full flex-col items-center gap-1.5 px-2 py-4 text-[0.7rem] font-bold sm:flex-row sm:justify-center sm:gap-2 sm:text-xs ${
                    state === "active" ? "text-ink" : state === "done" ? "text-ok" : "text-faint"
                  }`}
                >
                  <span
                    className={`grid size-7 place-items-center rounded-full ${
                      state === "active" ? "bg-gradient-to-b from-[#f3dca6] to-[#c9a35a] text-[#1a1406] shadow-[0_0_18px_-2px_rgb(227_194_125/0.7)]" : state === "done" ? "bg-ok-soft text-ok" : "bg-white/[0.05] text-faint"
                    }`}
                  >
                    {state === "done" ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
                  </span>
                  {title}
                </button>
                {state === "active" && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-transparent via-gold to-transparent" />}
              </li>
            );
          })}
        </ol>

        <div className="p-5 sm:p-7">
          {step === 0 && (
            <section className="space-y-5 animate-fade">
              <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-start sm:justify-between">
                <Header title="Tell us about yourself" sub="Enter details exactly as they appear on your ID." />
                <div className="w-full shrink-0 rounded-xl border border-gold/30 bg-gold/[0.06] p-3 sm:w-56">
                  <label htmlFor="referral_code" className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <Gift size={13} className="text-gold" /> Referral code <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    id="referral_code"
                    value={referralCode}
                    onChange={(e) => {
                      const code = normalizeReferralCode(e.target.value);
                      setReferralCode(code);
                      try {
                        if (code) sessionStorage.setItem(REF_KEY, code);
                        else sessionStorage.removeItem(REF_KEY);
                      } catch {}
                    }}
                    maxLength={20}
                    placeholder="e.g. MP7K2Q9X"
                    autoComplete="off"
                    className="mt-1.5 !h-9 font-mono text-sm uppercase tracking-wider"
                  />
                  <p
                    className={`mt-1 min-h-4 text-[0.7rem] ${
                      refStatus === "valid" ? "text-ok" : refStatus === "invalid" ? "text-bad" : "text-muted"
                    }`}
                    aria-live="polite"
                  >
                    {refStatus === "valid"
                      ? "✓ Referral code applied"
                      : refStatus === "invalid"
                        ? "Code not found — check it or leave blank"
                        : refStatus === "checking"
                          ? "Checking…"
                          : ""}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" k="full_name" err={errors.full_name}>
                  <input {...f("full_name")} autoComplete="name" maxLength={100} value={v.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="As on your ID" />
                </Field>
                <Field label="Mobile number" k="phone" err={errors.phone}>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 grid w-12 place-items-center text-sm font-semibold text-muted">+91</span>
                    <input
                      {...f("phone")}
                      className="!pl-12"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      value={v.phone}
                      onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
                      placeholder="98765 43210"
                    />
                  </div>
                </Field>

                <Field label="Alternative phone number" k="alt_phone" err={errors.alt_phone} hint="Alternative or family mobile number (optional).">
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 grid w-12 place-items-center text-sm font-semibold text-muted">+91</span>
                    <input
                      {...f("alt_phone")}
                      className="!pl-12"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={10}
                      value={v.alt_phone}
                      onChange={(e) => set("alt_phone", e.target.value.replace(/\D/g, ""))}
                      placeholder="98765 43211"
                    />
                  </div>
                </Field>

                <Field label="Email ID" k="email" err={errors.email} hint="For application status and loan updates.">
                  <input
                    {...f("email")}
                    type="email"
                    autoComplete="email"
                    maxLength={100}
                    value={v.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="name@example.com"
                  />
                </Field>

                <Field label="Date of birth" k="dob" err={errors.dob}>
                  <input {...f("dob")} type="date" value={v.dob} onChange={(e) => set("dob", e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                </Field>
                <Field label="What do you do?" k="category" err={errors.category}>
                  <select
                    {...f("category")}
                    value={v.category}
                    onChange={(e) => {
                      set("category", e.target.value);
                      if (e.target.value === "Driver") set("identity_type", "Driving licence");
                      else if (v.identity_type === "Driving licence") set("identity_type", "Voter ID");
                    }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div>
                <Field label="Loan amount you need" k="requested_amount" err={errors.requested_amount}>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-base font-semibold text-muted">₹</span>
                    <input
                      {...f("requested_amount")}
                      className="!pl-10 !text-lg !font-bold"
                      inputMode="numeric"
                      value={v.requested_amount}
                      onChange={(e) => set("requested_amount", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                </Field>
                <div className="mt-3 flex flex-wrap gap-2">
                  {AMOUNTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => set("requested_amount", String(a))}
                      className={`chip border ${Number(v.requested_amount) === a ? "border-gold/60 bg-gold-soft text-gold-ink" : "border-white/10 bg-white/[0.03] text-ink-2 hover:border-white/25"}`}
                    >
                      {rupees(a)}
                    </button>
                  ))}
                </div>
                <p className="hint">Between ₹1,000 and ₹5,00,000. The lender sets the final amount.</p>
                <EmiEstimate rate={annualRate} amount={Number(v.requested_amount)} tenure={tenure} setTenure={setTenure} />
              </div>

              <div className="grid gap-4 border-t hairline pt-5 sm:grid-cols-6">
                <div className="sm:col-span-6">
                  <Field label="Current address" k="address" err={errors.address}>
                    <textarea {...f("address")} rows={2} autoComplete="street-address" maxLength={500} value={v.address} onChange={(e) => set("address", e.target.value)} placeholder="House / flat, street, locality" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="City" k="city" err={errors.city}>
                    <input {...f("city")} autoComplete="address-level2" maxLength={100} value={v.city} onChange={(e) => set("city", e.target.value)} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="State" k="state" err={errors.state}>
                    <input {...f("state")} autoComplete="address-level1" maxLength={100} value={v.state} onChange={(e) => set("state", e.target.value)} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="PIN code" k="pincode" err={errors.pincode}>
                    <input {...f("pincode")} inputMode="numeric" autoComplete="postal-code" maxLength={6} value={v.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
                  </Field>
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-6 animate-fade">
              <Header
                title="Upload your documents"
                sub="Upload your two mandatory verification documents (Aadhaar Card and PAN Card). Additional ID cards below are optional."
              />

              {/* 1. Optional ID Cards (Voter ID / ID Card / Driving Licence) */}
              <div className="rounded-2xl border hairline bg-white/[0.02] p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-md bg-gold/15 text-gold text-xs font-bold">1</span>
                    <p className="font-semibold text-sm">ID Card / Voter ID / Driving Licence <span className="text-xs font-normal text-muted">(Optional)</span></p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FileDrop
                    id="identity_file"
                    label="ID Card / Voter ID (Optional)"
                    hint="Front side · up to 5 MB"
                    file={files.identity}
                    onChange={(x) => setFile("identity", x, "identity_file")}
                    error={errors.identity_file}
                  />
                  <FileDrop
                    id="driving_licence"
                    label={v.category === "Driver" ? "Driving Licence (Required for drivers)" : "Driving Licence (Optional)"}
                    hint="Front side · up to 5 MB"
                    file={files.driving_licence}
                    onChange={(x) => setFile("driving_licence", x, "driving_licence")}
                    error={errors.driving_licence}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FileDrop
                    id="identity_back"
                    label="ID Card — back (Optional)"
                    hint="Back side (optional)"
                    file={files.identity_back}
                    onChange={(x) => setFile("identity_back", x, "identity_back")}
                  />
                  <Field label="Last 4 characters of ID number (Optional)" k="identity_last4" err={errors.identity_last4} hint="Optional — never type your full ID number.">
                    <input
                      {...f("identity_last4")}
                      maxLength={4}
                      className="font-mono tracking-[0.3em] uppercase"
                      value={v.identity_last4}
                      onChange={(e) => set("identity_last4", e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                      placeholder="XXXX"
                    />
                  </Field>
                </div>
              </div>

              {/* 2. Two Mandatory Verification Documents (Aadhaar & PAN) */}
              <div className="rounded-2xl border hairline bg-white/[0.02] p-4 sm:p-5 space-y-5">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-md bg-gold/15 text-gold text-xs font-bold">2</span>
                  <div>
                    <p className="font-semibold text-sm">Two Verification Documents (Aadhaar &amp; PAN Card)</p>
                    <p className="text-xs text-muted">Required for instant KYC identity and address verification.</p>
                  </div>
                </div>

                {/* Document 1: Aadhaar Card */}
                <div className="space-y-3 pt-3 border-t hairline">
                  <p className="text-xs font-bold uppercase tracking-wider text-champagne">Document 1: Aadhaar Card</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FileDrop
                      id="aadhaar_file"
                      label="Aadhaar Card — front"
                      hint="Front photo side · up to 5 MB"
                      required
                      file={files.aadhaar}
                      onChange={(x) => setFile("aadhaar", x, "aadhaar_file")}
                      error={errors.aadhaar_file}
                    />
                    <FileDrop
                      id="aadhaar_back_file"
                      label="Aadhaar Card — back"
                      hint="Back side showing address · up to 5 MB"
                      file={files.aadhaar_back}
                      onChange={(x) => setFile("aadhaar_back", x, "aadhaar_back_file")}
                    />
                  </div>
                </div>

                {/* Document 2: PAN Card */}
                <div className="space-y-3 pt-3 border-t hairline">
                  <p className="text-xs font-bold uppercase tracking-wider text-champagne">Document 2: PAN Card</p>
                  <FileDrop
                    id="pan_file"
                    label="PAN Card — front"
                    hint="Permanent Account Number card · up to 5 MB"
                    required
                    file={files.pan}
                    onChange={(x) => setFile("pan", x, "pan_file")}
                    error={errors.pan_file}
                  />
                </div>
              </div>

              {v.category === "Student" && (
                <div className="rounded-2xl border hairline bg-white/[0.02] p-4 sm:p-5 space-y-4">
                  <p className="font-semibold text-sm">Student Verification</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FileDrop
                      id="student_file"
                      label="Student ID card"
                      hint="Valid for the current academic year · up to 5 MB"
                      required
                      file={files.student}
                      onChange={(x) => setFile("student", x, "student_file")}
                      error={errors.student_file}
                    />
                    <Field label="School / college / university" k="institution" err={errors.institution}>
                      <input {...f("institution")} maxLength={150} value={v.institution} onChange={(e) => set("institution", e.target.value)} placeholder="e.g. St. Xavier's College, Mumbai" />
                    </Field>
                  </div>
                </div>
              )}

              <Check2 id="kyc_consent" checked={v.kyc_consent} onChange={(c) => set("kyc_consent", c)} error={errors.kyc_consent}>
                These documents are mine and the details are accurate. I consent to them being reviewed for this application and shared with the lender.
              </Check2>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5 animate-fade">
              <Header title={`Pay the ₹${FEE} application fee`} sub="Choose your preferred payment method below." />

              <Check2 id="payment_consent" checked={v.payment_consent} onChange={(c) => set("payment_consent", c)} error={errors.payment_consent}>
                <strong className="mb-1 block text-ink">Terms &amp; Conditions (required)</strong>
                I agree to the{" "}
                <Link href="/terms" target="_blank" rel="noopener" title="Opens in a new tab" className="font-semibold text-gold underline underline-offset-4">
                  Terms &amp; Conditions
                </Link>
                {" "}and acknowledge the{" "}
                <Link href="/privacy" target="_blank" rel="noopener" title="Opens in a new tab" className="font-semibold text-gold underline underline-offset-4">
                  Privacy Policy
                </Link>
                . I understand the ₹{fee} application fee covers document and payment verification and is non-refundable.
                The lender decides the final loan terms.
              </Check2>

              {/* Payment Method Switcher */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
                <button
                  type="button"
                  onClick={() => setPayMethod("razorpay")}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs sm:text-sm font-bold transition ${
                    payMethod === "razorpay"
                      ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 shadow-sm"
                      : "text-muted hover:text-ink hover:bg-white/[0.04]"
                  }`}
                >
                  <CreditCard size={16} />
                  <span>Pay with Razorpay</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod("qr")}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs sm:text-sm font-bold transition ${
                    payMethod === "qr"
                      ? "border border-gold/40 bg-gold/20 text-gold-ink shadow-sm"
                      : "text-muted hover:text-ink hover:bg-white/[0.04]"
                  }`}
                >
                  <QrCode size={16} />
                  <span>Scan UPI QR Code</span>
                </button>
              </div>

              {payMethod === "razorpay" ? (
                <div className="card-glow rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#0c2214] via-[#07150c] to-[#040c06] p-5 sm:p-6 space-y-4">
                  {razorpayPaymentId ? (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 p-4 text-emerald-300 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-base text-ink">
                        <CheckCircle2 size={20} className="text-emerald-400" />
                        <span>Payment Verified via Razorpay!</span>
                      </div>
                      <p className="text-xs text-ink-2">
                        Payment ID: <strong className="font-mono text-gold">{razorpayPaymentId}</strong>
                      </p>
                      <p className="text-xs text-muted">
                        Amount Paid: ₹{fee} · Receipt generated and attached automatically. You can proceed directly.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
                          Automated Online Verification
                        </span>
                        <h3 className="text-lg font-bold text-ink">Instant Checkout (UPI, Cards, Netbanking)</h3>
                        <p className="text-xs text-muted leading-relaxed">
                          Pay ₹{fee} securely using Google Pay, PhonePe, Paytm, BHIM UPI, Netbanking, or Cards. Your payment will be verified instantly without needing manual screenshot upload.
                        </p>
                      </div>

                      {razorpayError && (
                        <p className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-xs text-bad">
                          {razorpayError}
                        </p>
                      )}

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => void handleRazorpayPayment()}
                          disabled={razorpayLoading}
                          className="btn btn-primary btn-lg w-full justify-center font-bold text-sm shadow-lg shadow-emerald-950/50"
                        >
                          {razorpayLoading ? (
                            <>
                              <Loader2 size={16} className="animate-spin" /> Connecting to Razorpay…
                            </>
                          ) : (
                            <>
                              <CreditCard size={17} /> Pay ₹{fee} with Razorpay
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}

                  <div className="pt-2">
                    <Field label="Your UPI ID" k="refund_upi_id" err={errors.refund_upi_id} hint="Your personal UPI ID (e.g. yourname@okaxis).">
                      <input
                        {...f("refund_upi_id")}
                        autoCapitalize="none"
                        maxLength={120}
                        value={v.refund_upi_id}
                        onChange={(e) => set("refund_upi_id", e.target.value.trim())}
                        placeholder="yourname@okaxis"
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <>
                  <div className="card-glow grid gap-6 rounded-2xl border hairline bg-gradient-to-br from-white/[0.05] to-transparent p-5 sm:grid-cols-[180px_1fr] sm:p-6">
                    <div className="mx-auto w-full max-w-[180px] rounded-2xl bg-white p-3 shadow-[0_20px_40px_-15px_rgb(0_0_0/0.8)]">
                      {qrUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrUrl} alt={`UPI QR code for ${payment?.payee_name}`} className="aspect-square w-full rounded-lg object-contain" />
                      ) : (
                        <div className="grid aspect-square place-items-center text-center text-xs text-muted">QR not published yet</div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pay to</p>
                      <p className="mt-1 text-lg font-bold">{payment?.payee_name || "—"}</p>
                      {payment?.upi_id && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(payment.upi_id);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1800);
                          }}
                          className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg border hairline bg-white/[0.04] px-3 py-1.5 font-mono text-sm"
                        >
                          {payment.upi_id} {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} className="text-muted" />}
                        </button>
                      )}
                      <p className="display mt-4 text-4xl text-champagne">₹{fee}</p>
                      <p className="text-xs text-muted">Scan the QR with GPay, PhonePe, or Paytm.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="UPI transaction ID (UTR)" k="transaction_id" err={errors.transaction_id} hint="12-digit number in your UPI app's payment details.">
                      <input
                        {...f("transaction_id")}
                        className="font-mono"
                        maxLength={40}
                        value={v.transaction_id}
                        onChange={(e) => set("transaction_id", e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
                        placeholder="e.g. 428192018291"
                      />
                    </Field>
                    <Field label="Your UPI ID" k="refund_upi_id" err={errors.refund_upi_id} hint="Your personal UPI ID (e.g. yourname@okaxis).">
                      <input {...f("refund_upi_id")} autoCapitalize="none" maxLength={120} value={v.refund_upi_id} onChange={(e) => set("refund_upi_id", e.target.value.trim())} placeholder="yourname@okaxis" />
                    </Field>
                  </div>
                  <FileDrop
                    id="proof"
                    label="Payment screenshot"
                    hint="The confirmation screen showing amount, payee and UTR · PNG/JPG/WebP"
                    types={IMAGE_TYPES}
                    required
                    file={files.proof}
                    onChange={(x) => setFile("proof", x, "proof")}
                    error={errors.proof}
                  />
                </>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="space-y-5 animate-fade">
              <Header title="Check and submit" sub="You can't edit an application after submitting it." />
              <dl className="divide-y divide-line overflow-hidden rounded-2xl border hairline text-sm">
                <Summary k="Name" v={v.full_name} />
                <Summary k="Mobile" v={`+91 ${v.phone}`} />
                {v.alt_phone && <Summary k="Alternative mobile" v={`+91 ${v.alt_phone}`} />}
                <Summary k="Email ID" v={v.email} />
                <Summary k="Date of birth" v={v.dob} />
                <Summary k="Category" v={v.category + (v.category === "Student" ? ` · ${v.institution}` : "")} />
                <Summary k="Amount requested" v={rupees(Number(v.requested_amount) || 0)} strong />
                <Summary k="Address" v={`${v.address}, ${v.city}, ${v.state} ${v.pincode}`} />
                <Summary k="Main ID" v={`${input.identity_type} ···· ${v.identity_last4.toUpperCase()}`} />
                <Summary
                  k="Documents"
                  v={[
                    files.identity && `${input.identity_type} (front)`,
                    files.identity_back && `${input.identity_type} (back)`,
                    (files.aadhaar || files.address) && "Aadhaar Card (front)",
                    files.aadhaar_back && "Aadhaar Card (back)",
                    files.pan && "PAN Card",
                    v.category === "Student" && files.student && "Student ID",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Summary k="UTR" v={v.transaction_id.toUpperCase()} mono />
                <Summary k="UPI ID" v={v.refund_upi_id} mono />
              </dl>
              {serverError && <Notice tone="bad">{serverError}</Notice>}
            </section>
          )}

          {/* Nav */}
          <div className="mt-6 flex items-center justify-between gap-3 border-t hairline pt-5">
            <button type="button" className="btn btn-ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft size={16} /> Back
            </button>
            {step < 3 ? (
              <button type="button" className="btn btn-dark btn-lg" onClick={() => void next()} disabled={checkingDup}>
                {checkingDup ? <Loader2 size={16} className="animate-spin" /> : null} Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void submit()}>
                {busy ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> {progress || "Submitting…"}
                  </>
                ) : (
                  <>
                    Submit application <ArrowRight size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="space-y-4 lg:sticky lg:top-32">
        <div className="card card-glow p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Your application</p>
          <p className="display mt-2 text-4xl text-champagne">{rupees(Number(v.requested_amount) || 0)}</p>
          <p className="text-sm text-muted">{v.category}</p>
          {estimate > 0 && (
            <p className="mt-3 rounded-xl border border-gold/20 bg-gold-soft/50 px-3 py-2 text-sm">
              About <strong>{rupees(estimate)}</strong>/month for {tenure} months
              <span className="block text-[0.7rem] text-muted">Estimate at {annualRate}% a year</span>
            </p>
          )}
          <ul className="mt-5 space-y-3 border-t hairline pt-5 text-sm">
            <li className="flex items-start gap-3">
              <BadgeIndianRupee size={17} className="mt-0.5 shrink-0 text-brand" />
              <span>
                <strong>₹{fee} fee</strong>, one-time document verification fee
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-brand" />
              <span>Documents stored privately; only reviewers can open them</span>
            </li>
            <li className="flex items-start gap-3">
              <CircleCheckBig size={17} className="mt-0.5 shrink-0 text-brand" />
              <span>Instant loan in 48 hours, status visible on this page</span>
            </li>
          </ul>
        </div>

        <div className="card p-5 border border-gold/30 bg-gradient-to-br from-[#0c2013] via-[#07150c] to-[#040c06] space-y-2">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-gold/15 text-gold">
              <Gift size={14} />
            </span>
            <p className="font-bold text-xs uppercase tracking-wider text-gold">Refer &amp; Earn 1,000 Coins</p>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Invite your friends to apply. Get 1,000 coins per verified referral and convert directly into real cash to your UPI!
          </p>
        </div>

        <div className="well p-5 text-xs leading-relaxed text-muted">
          <strong className="text-ink-2">Broker platform:</strong> MoneyPayee verifies your application and forwards it to our banking &amp; lending partners. Interest rate and repayment terms are set by the lender and shared in a Key Fact Statement before you sign.
        </div>
      </aside>
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="display text-2xl sm:text-3xl">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{sub}</p>
    </div>
  );
}

function Field({ label, k, err, hint, children }: { label: string; k: string; err?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={k}>
        {label}
      </label>
      {children}
      {err ? <FieldError id={k} message={err} /> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

function Check2({ id, checked, onChange, error, children }: { id: string; checked: boolean; onChange: (c: boolean) => void; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed text-ink-2 transition ${
          error ? "border-bad/40 bg-bad-soft/60" : checked ? "border-gold/35 bg-gold-soft/70" : "border-white/[0.08] bg-white/[0.02]"
        }`}
      >
        <input id={id} type="checkbox" required className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={Boolean(error)} aria-describedby={error ? id + "-error" : undefined} />
        <span>{children}</span>
      </label>
      <FieldError id={id} message={error} />
    </div>
  );
}

function Summary({ k, v, strong = false, mono = false }: { k: string; v: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-4 bg-white/[0.015] px-4 py-3 sm:grid-cols-[180px_1fr]">
      <dt className="text-muted">{k}</dt>
      <dd className={`break-words ${strong ? "font-bold" : "font-medium"} ${mono ? "font-mono" : ""}`}>{v || "—"}</dd>
    </div>
  );
}

const validAmount = (n: number) => Number.isInteger(n) && n >= 1000 && n <= 500000;

/** EMI for each tenure at the illustrative rate, updating as the amount changes. */
function EmiEstimate({ amount, rate, tenure, setTenure }: { amount: number; rate: number; tenure: number; setTenure: (t: number) => void }) {
  if (!validAmount(amount)) return null;
  const rows = LOAN_ESTIMATE.tenures.map((m) => {
    const e = emi(amount, rate, m);
    return { m, emi: e, total: e * m, interest: e * m - amount };
  });
  const pick = rows.find((r) => r.m === tenure) ?? rows[0];
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-b from-gold/[0.06] to-transparent">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gold/15 px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-ink">What your EMI could look like</p>
        <p className="text-xs text-muted">
          for {rupees(amount)} at {rate}% a year
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:p-4" role="radiogroup" aria-label="Repayment period">
        {rows.map((r) => {
          const on = r.m === pick.m;
          return (
            <button
              key={r.m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTenure(r.m)}
              className={`rounded-xl border p-3 text-left transition ${on ? "border-gold/60 bg-gold-soft shadow-[0_0_24px_-10px_rgb(227_194_125/0.8)]" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
            >
              <span className={`block text-xs font-semibold ${on ? "text-gold-ink" : "text-muted"}`}>{r.m} months</span>
              <span className="display mt-1 block text-lg leading-tight text-ink sm:text-xl">
                {rupees(r.emi)}
                <span className="text-xs font-normal text-muted">/mo</span>
              </span>
            </button>
          );
        })}
      </div>
      <dl className="grid grid-cols-3 gap-px border-t border-gold/15 bg-white/[0.04] text-center">
        {[
          ["Monthly EMI", rupees(pick.emi)],
          ["Total interest", rupees(pick.interest)],
          ["Total to repay", rupees(pick.total)],
        ].map(([k, val]) => (
          <div key={k} className="bg-paper/80 px-2 py-3">
            <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">{k}</dt>
            <dd className="mt-1 text-sm font-bold text-ink sm:text-base">{val}</dd>
          </div>
        ))}
      </dl>
      <p className="px-4 py-3 text-[0.7rem] leading-relaxed text-muted sm:px-5">
        This is only an estimate. The lender decides the actual interest rate, tenure and charges, and shows them in a Key Fact Statement before you sign.
      </p>
    </div>
  );
}
