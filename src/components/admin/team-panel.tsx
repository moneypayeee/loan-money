"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dateOnly, errorText, timeAgo } from "@/lib/format";
import type { AdminMember } from "@/lib/types";
import { Notice } from "../ui";
import type { AdminCtx } from "./admin-console";
import { Empty, initials, Pill } from "./kit";
import { demoAdmins } from "./demo-data";

/** Read-only list of everyone who can sign in to the admin console. */
export function TeamPanel({ ctx }: { ctx: AdminCtx }) {
  const live = !ctx.demo && Boolean(supabase);
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!live) return setMembers(demoAdmins());
    let alive = true;
    supabase!.rpc("admin_list_admins").then(({ data, error }) => {
      if (!alive) return;
      if (error) setErr(errorText(error));
      setMembers(error ? [] : ((data ?? []) as AdminMember[]));
    });
    return () => {
      alive = false;
    };
  }, [live]);

  // You first, then by when they became an admin
  const list = [...(members ?? [])].sort((a, b) => Number(b.is_me) - Number(a.is_me) || a.created_at.localeCompare(b.created_at));

  return (
    <div className="space-y-4">
      {err && (
        <Notice tone="bad" onClose={() => setErr("")}>
          {err}
        </Notice>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-4 sm:px-6">
          <h2 className="font-bold">Admins</h2>
          {members && <Pill tone="muted">{members.length}</Pill>}
        </div>

        {!members ? (
          <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted sm:px-6">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </p>
        ) : list.length === 0 ? (
          <Empty>No admins found.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((m) => (
              <li key={m.user_id} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full text-xs font-black text-[#1a1406]"
                  style={{ background: "linear-gradient(145deg,#f6e3b4,#c9a35a)" }}
                  aria-hidden
                >
                  {initials(m.email.split("@")[0].replace(/[._-]+/g, " "))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold leading-tight">{m.email}</span>
                    {m.is_me && <span className="shrink-0 rounded-full border border-gold/25 bg-gold-soft px-2 text-[0.65rem] font-bold leading-[1.15rem] text-gold-ink">You</span>}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    Admin since {dateOnly(m.created_at)}
                    <span className="sm:hidden"> · {m.last_sign_in_at ? `active ${active(m)}` : active(m).toLowerCase()}</span>
                  </p>
                </div>
                <div className="hidden w-36 shrink-0 text-right sm:block">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-faint">Last active</p>
                  <p className="mt-1 text-sm text-ink-2">{active(m)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Admins can see all applications, KYC documents and loans. Everything they do is shown in Activity.
      </p>
    </div>
  );
}

const active = (m: AdminMember) => (m.last_sign_in_at ? timeAgo(m.last_sign_in_at) : "Never signed in");
