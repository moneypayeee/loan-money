"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  ExternalLink,
  FileStack,
  FlaskConical,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptIndianRupee,
  ScanFace,
  RefreshCw,
  RotateCcw,
  ShieldX,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEMO_ADMIN_KEY, signOut, useSession } from "@/lib/use-session";
import { useSettings } from "@/lib/settings-context";
import { errorText, todayIST } from "@/lib/format";
import { accountLabel } from "@/lib/phone-auth";
import { APPLICATION_COLUMNS, type AdminLoanPayment, type Application, type BorrowerAccess, type DashboardStats, type Loan, type LoanPayment } from "@/lib/types";
import { Logo, Notice, Spinner } from "../ui";
import { Overview } from "./overview";
import { ApplicationsPanel } from "./applications-panel";
import { RefundsPanel } from "./refunds-panel";
import { CustomersPanel } from "./customers-panel";
import { LoansPanel } from "./loans-panel";
import { CollectionsPanel } from "./collections-panel";
import { FeesPanel } from "./fees-panel";
import { ActivityPanel } from "./activity-panel";
import { ReportsPanel } from "./reports-panel";
import { TeamPanel } from "./team-panel";
import { KycPanel } from "./kyc-panel";
import { buildCustomers, buildLoanRows, type Customer, type LoanRow } from "./portfolio";
import { ApplicationDrawer } from "./application-drawer";
import { demoAccess, demoApps, demoLoans, demoPayments, demoStats } from "./demo-data";

export type Tab = "overview" | "customers" | "applications" | "kyc" | "loans" | "collections" | "fees" | "refunds" | "activity" | "reports" | "team";

export type AdminCtx = {
  apps: Application[];
  stats: DashboardStats | null;
  reload: () => Promise<void>;
  open: (id: string) => void;
  go: (tab: Tab, filter?: string) => void;
  toast: (tone: "ok" | "bad", text: string) => void;
  /** True when Supabase is not configured: sample data, changes stay in memory. */
  demo: boolean;
  /** Demo mode only: update an application in local state. */
  patch: (id: string, changes: Partial<Application>) => void;
  /** Loan book (all loans, EMI payments and borrower logins). */
  loans: Loan[];
  payments: AdminLoanPayment[];
  access: BorrowerAccess[];
  loanRows: LoanRow[];
  customers: Customer[];
  /** Today in India, YYYY-MM-DD. */
  today: string;
  /** Show one customer's profile in the Customers tab. */
  openCustomer: (userId: string) => void;
  /** Open one application's documents in the KYC tab. */
  openKyc: (appId: string) => void;
  /** Mark an EMI as paid. Resolves to an error message, or null on success. */
  recordPayment: (appId: string, p: LoanPayment) => Promise<string | null>;
  /** Demo mode only: keep the console's loan book in step with edits made in the review drawer. */
  syncDemoLoan: (appId: string, loan: Loan | null, payments: LoanPayment[]) => void;
};

export function AdminConsole() {
  const router = useRouter();
  const { user, ready } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [demoAuthed, setDemoAuthed] = useState<boolean | null>(null);

  // Demo mode: the console opens only after "signing in" on /admin/login.
  useEffect(() => {
    if (supabase) return;
    let ok = false;
    try {
      ok = sessionStorage.getItem(DEMO_ADMIN_KEY) === "1";
    } catch {}
    setDemoAuthed(ok);
    if (!ok) router.replace("/admin/login");
  }, [router]);

  // Live mode: must be signed in…
  useEffect(() => {
    if (supabase && ready && !user) router.replace("/admin/login");
  }, [ready, user, router]);

  // …and listed in admin_users.
  useEffect(() => {
    if (!supabase || !user) return setIsAdmin(null);
    let alive = true;
    supabase.rpc("is_admin").then(({ data, error }) => alive && setIsAdmin(!error && data === true));
    return () => {
      alive = false;
    };
  }, [user]);

  if (!supabase) return demoAuthed ? <Console email="demo@moneypay.local" demo /> : <Spinner label="Opening sign in…" />;
  if (!ready || !user) return <Spinner label="Checking your session…" />;
  if (isAdmin === null) return <Spinner label="Checking access…" />;
  if (!isAdmin)
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <div className="card w-full max-w-md p-8 text-center">
          <ShieldX size={32} className="mx-auto text-bad" />
          <h1 className="display mt-4 text-2xl">No admin access</h1>
          <p className="mt-2 text-sm text-muted">{accountLabel(user)} is not an administrator. Ask the owner to add you to admin_users.</p>
          <button type="button" className="btn btn-outline mt-6" onClick={() => void signOut("/admin/login")}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </main>
    );
  return <Console email={accountLabel(user)} />;
}

function Console({ email, demo = false }: { email: string; demo?: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [filter, setFilter] = useState("pending");
  const [apps, setApps] = useState<Application[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<AdminLoanPayment[]>([]);
  const [access, setAccess] = useState<BorrowerAccess[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [kycId, setKycId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const reload = useCallback(async () => {
    if (demo) {
      setApps((prev) => {
        const list = prev.length ? prev : demoApps();
        setStats(demoStats(list));
        return list;
      });
      setLoans((prev) => {
        if (prev.length) return prev;
        const l = demoLoans();
        setPayments(demoPayments(l));
        setAccess(demoAccess());
        return l;
      });
      setLoaded(true);
      return;
    }
    if (!supabase) return;
    setRefreshing(true);
    try {
      const [a, s, l, p, b] = await Promise.all([
        supabase.from("applications").select(APPLICATION_COLUMNS).order("created_at", { ascending: false }).limit(5000),
        supabase.rpc("admin_dashboard_stats"),
        supabase.from("loans").select("*").limit(5000),
        supabase.from("loan_payments").select("application_id,instalment_no,paid_on,amount,reference").order("paid_on", { ascending: false }).limit(20000),
        supabase.from("borrower_access").select("application_id,issued_at,last_login_at,locked_until").limit(5000),
      ]);
      for (const r of [a, s, l, p, b]) if (r.error) throw r.error;
      setApps((a.data ?? []) as unknown as Application[]);
      setStats(s.data as DashboardStats);
      setLoans((l.data ?? []) as Loan[]);
      setPayments((p.data ?? []) as AdminLoanPayment[]);
      setAccess((b.data ?? []) as BorrowerAccess[]);
    } catch (err) {
      setMsg({ tone: "bad", text: errorText(err) });
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, [demo]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(t);
  }, [reload]);

  const today = todayIST();
  const loanRows = useMemo(() => buildLoanRows(apps, loans, payments, access, today), [apps, loans, payments, access, today]);
  const customers = useMemo(() => buildCustomers(apps, loanRows), [apps, loanRows]);

  async function recordPayment(appId: string, p: LoanPayment): Promise<string | null> {
    if (demo) {
      setPayments((prev) => [...prev.filter((x) => !(x.application_id === appId && x.instalment_no === p.instalment_no)), { ...p, application_id: appId }]);
      return null;
    }
    if (!supabase) return "Supabase isn't configured.";
    const { error } = await supabase.rpc("admin_record_payment", {
      p_id: appId,
      p_instalment: p.instalment_no,
      p_paid_on: p.paid_on,
      p_amount: p.amount,
      p_reference: p.reference,
    });
    if (error) return errorText(error);
    setPayments((prev) => [...prev.filter((x) => !(x.application_id === appId && x.instalment_no === p.instalment_no)), { ...p, application_id: appId }]);
    return null;
  }

  const ctx: AdminCtx = {
    apps,
    stats,
    reload,
    open: setOpenId,
    go: (t, f) => {
      setTab(t);
      if (t === "customers") setCustomerId(null);
      if (t === "kyc") setKycId(null);
      if (f) setFilter(f);
      setNavOpen(false);
      window.scrollTo({ top: 0 });
    },
    toast: (tone, text) => setMsg({ tone, text }),
    demo,
    patch: (id, changes) =>
      setApps((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, ...changes } : a));
        setStats(demoStats(next));
        return next;
      }),
    loans,
    payments,
    access,
    loanRows,
    customers,
    today,
    openCustomer: (id) => {
      if (openId && !demo) void reload(); // the drawer may have changed loan data
      setCustomerId(id);
      setTab("customers");
      setOpenId(null);
      window.scrollTo({ top: 0 });
    },
    openKyc: (id) => {
      setKycId(id);
      setTab("kyc");
      setOpenId(null);
      window.scrollTo({ top: 0 });
    },
    recordPayment,
    syncDemoLoan: (appId, loan, list) => {
      if (!demo) return;
      if (loan) setLoans((prev) => [...prev.filter((x) => x.application_id !== appId), loan]);
      setPayments((prev) => [...prev.filter((x) => x.application_id !== appId), ...list.map((x) => ({ ...x, application_id: appId }))]);
    },
  };

  const refundCount = apps.filter((a) => a.refund_status === "pending").length;
  const pendingCount = apps.filter((a) => a.status === "pending").length;
  const kycCount = apps.filter((a) => a.status === "pending" && a.kyc_status === "pending").length;
  const overdueLoans = loanRows.filter((l) => l.overdueCount > 0).length;
  const openApp = apps.find((a) => a.id === openId) ?? null;

  const go = (t: Tab) => ctx.go(t);

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[272px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-white/[0.06] bg-[#05070d]/85 backdrop-blur-xl lg:sticky lg:top-0 lg:block lg:h-screen">
        <AdminSidebar tab={tab} go={go} email={email} demo={demo} pendingCount={pendingCount} refundCount={refundCount} overdueLoans={overdueLoans} kycCount={kycCount} />
      </aside>

      {/* Mobile sidebar drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${navOpen ? "" : "pointer-events-none"}`} aria-hidden={!navOpen}>
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={navOpen ? 0 : -1}
          onClick={() => setNavOpen(false)}
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${navOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Admin menu"
          className={`absolute inset-y-0 left-0 w-[86%] max-w-[300px] border-r border-white/10 bg-[#06080f]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)] ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <AdminSidebar tab={tab} go={go} email={email} demo={demo} pendingCount={pendingCount} refundCount={refundCount} overdueLoans={overdueLoans} kycCount={kycCount} onClose={() => setNavOpen(false)} />
        </aside>
      </div>

      <div className="min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b hairline bg-paper/75 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] lg:hidden"
                aria-label="Open menu"
                aria-expanded={navOpen}
                onClick={() => setNavOpen(true)}
              >
                <Menu size={19} />
              </button>
              <div className="min-w-0">
                <h1 className="display truncate text-lg leading-tight sm:text-xl">{TITLES[tab][0]}</h1>
                <p className="hidden truncate text-xs text-muted sm:block">{TITLES[tab][1]}</p>
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={() => void reload()} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-7 sm:py-6">
          {demo && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
              <FlaskConical size={18} className="mt-0.5 shrink-0" />
              <p>
                <strong>Demo mode</strong>: sample data only. Changes are not saved. Add your Supabase keys to <code className="font-mono text-xs">.env.local</code> and
                restart the server to go live; the admin login will then be required.
              </p>
            </div>
          )}
          {msg && (
            <div className="mb-5">
              <Notice tone={msg.tone} onClose={() => setMsg(null)}>
                {msg.text}
              </Notice>
            </div>
          )}
          {!loaded ? (
            <Spinner />
          ) : tab === "overview" ? (
            <Overview ctx={ctx} />
          ) : tab === "customers" ? (
            <CustomersPanel ctx={ctx} selected={customerId} select={setCustomerId} />
          ) : tab === "kyc" ? (
            <KycPanel ctx={ctx} selected={kycId} select={setKycId} />
          ) : tab === "applications" ? (
            <ApplicationsPanel ctx={ctx} filter={filter} setFilter={setFilter} />
          ) : tab === "loans" ? (
            <LoansPanel ctx={ctx} />
          ) : tab === "collections" ? (
            <CollectionsPanel ctx={ctx} />
          ) : tab === "fees" ? (
            <FeesPanel ctx={ctx} />
          ) : tab === "refunds" ? (
            <RefundsPanel ctx={ctx} />
          ) : tab === "activity" ? (
            <ActivityPanel ctx={ctx} />
          ) : tab === "reports" ? (
            <ReportsPanel ctx={ctx} />
          ) : (
            <TeamPanel ctx={ctx} />
          )}
        </main>
      </div>

      {openApp && (
        <ApplicationDrawer
          key={openApp.id}
          app={openApp}
          ctx={ctx}
          onClose={() => {
            setOpenId(null);
            // Pick up loan, EMI and document changes made in the drawer
            if (!demo) void reload();
          }}
        />
      )}
    </div>
  );
}

const TITLES: Record<Tab, [string, string]> = {
  overview: ["Overview", "Your review queue at a glance"],
  customers: ["Customers", "Everyone who has applied, with their applications and loans"],
  applications: ["Applications", "Check payments and decide"],
  kyc: ["KYC verification", "Check identity and address documents before the decision"],
  loans: ["Loans", "Every approved loan, its repayment and what is outstanding"],
  collections: ["Collections", "EMIs overdue and due soon; record payments and send reminders"],
  fees: ["Fee payments", "Every ₹299 application fee: UTRs, verification and refunds"],
  refunds: ["Refunds", "Send and record refunds for declined applications"],
  activity: ["Activity", "Who did what, and when"],
  reports: ["Reports", "Totals for any period, and CSV exports"],
  team: ["Admins", "Who can sign in to this console"],
};

function AdminSidebar({
  tab,
  go,
  email,
  demo,
  pendingCount,
  refundCount,
  overdueLoans,
  kycCount,
  onClose,
}: {
  tab: Tab;
  go: (t: Tab) => void;
  email: string;
  demo: boolean;
  pendingCount: number;
  refundCount: number;
  overdueLoans: number;
  kycCount: number;
  onClose?: () => void;
}) {
  const { site, payment, disclosed } = useSettings();
  const steps = [disclosed, Boolean(site?.grievance_officer && site?.grievance_email), Boolean(payment?.qr_path && payment?.upi_id)];
  const done = steps.filter(Boolean).length;
  const live = done === steps.length;
  const initials = (email.split("@")[0] || "A").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "AD";

  const Item = ({ t, label, icon: Icon, badge, gold = false }: { t: Tab; label: string; icon: typeof LayoutDashboard; badge?: number; gold?: boolean }) => {
    const on = tab === t;
    return (
      <button
        type="button"
        onClick={() => go(t)}
        aria-current={on ? "page" : undefined}
        className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[0.88rem] font-semibold transition ${
          on ? "bg-gradient-to-r from-gold/[0.13] via-gold/[0.04] to-transparent text-ink shadow-[inset_2px_0_0_var(--color-gold)]" : "text-ink-2 hover:bg-white/[0.04] hover:text-ink"
        }`}
      >
        <span
          className={`grid size-8 place-items-center rounded-lg border transition ${
            on ? "border-gold/30 bg-gold-soft text-gold" : "border-white/[0.07] bg-white/[0.03] text-muted group-hover:text-ink-2"
          }`}
        >
          <Icon size={15} />
        </span>
        {label}
        {!!badge && (
          <span className={`ml-auto min-w-6 rounded-full px-1.5 py-0.5 text-center text-[0.68rem] font-bold ${gold ? "bg-gold text-[#1a1406]" : "bg-white/10 text-ink-2"}`}>{badge}</span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between gap-2 border-b border-white/[0.06] px-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted">Admin</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04]" aria-label="Close menu">
            <X size={17} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {/* Status */}
        <div className="well mb-5 block w-full p-3.5 text-left">
          {live ? (
            <>
              <span className="flex items-center gap-2 text-xs font-semibold text-ok">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-ok" />
                </span>
                Applications open
              </span>
              <span className="mt-1 block truncate text-xs text-muted">{site?.lender_name}</span>
            </>
          ) : (
            <>
              <span className="flex items-center justify-between text-xs font-semibold text-gold-ink">
                Setup {done} of {steps.length}
              </span>
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <span className="block h-full rounded-full bg-gradient-to-r from-gold to-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
              </span>
              <span className="mt-2 block text-[0.7rem] leading-snug text-muted">Applications are closed until src/config/site.ts is filled in.</span>
            </>
          )}
        </div>

        <p className="px-2.5 pb-2 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-faint">Workspace</p>
        <nav className="space-y-1" aria-label="Workspace">
          <Item t="overview" label="Overview" icon={LayoutDashboard} />
          <Item t="customers" label="Customers" icon={Users} />
          <Item t="kyc" label="KYC verification" icon={ScanFace} badge={kycCount} gold />
          <Item t="applications" label="Applications" icon={FileStack} badge={pendingCount} />
        </nav>

        <p className="px-2.5 pb-2 pt-6 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-faint">Lending</p>
        <nav className="space-y-1" aria-label="Lending">
          <Item t="loans" label="Loans" icon={Landmark} />
          <Item t="collections" label="Collections" icon={CalendarClock} badge={overdueLoans} gold />
        </nav>

        <p className="px-2.5 pb-2 pt-6 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-faint">Money</p>
        <nav className="space-y-1" aria-label="Money">
          <Item t="fees" label="Fee payments" icon={ReceiptIndianRupee} />
          <Item t="refunds" label="Refunds" icon={RotateCcw} badge={refundCount} gold />
        </nav>

        <p className="px-2.5 pb-2 pt-6 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-faint">Admin</p>
        <nav className="space-y-1" aria-label="Admin">
          <Item t="reports" label="Reports" icon={BarChart3} />
          <Item t="activity" label="Activity" icon={History} />
          <Item t="team" label="Admins" icon={UserCog} />
          <Link
            href="/"
            target="_blank"
            className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[0.88rem] font-semibold text-ink-2 transition hover:bg-white/[0.04] hover:text-ink"
          >
            <span className="grid size-8 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-muted group-hover:text-ink-2">
              <ExternalLink size={15} />
            </span>
            View public site
          </Link>
        </nav>
      </div>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-black text-[#1a1406]"
            style={{ background: "linear-gradient(145deg,#f6e3b4,#c9a35a)" }}
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{email}</p>
            <p className="text-[0.7rem] text-muted">{demo ? "Demo mode" : "Administrator"}</p>
          </div>
          <button type="button" onClick={() => void signOut("/admin/login")} className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-white/[0.06] hover:text-ink" aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
