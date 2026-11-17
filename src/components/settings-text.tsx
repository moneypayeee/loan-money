"use client";

import { useSettings } from "@/lib/settings-context";

export function LenderName({ fallback = "our banking & lending partners" }: { fallback?: string }) {
  const { site } = useSettings();
  const name = site?.lender_name && !/sample/i.test(site.lender_name) ? site.lender_name : fallback;
  return <>{name}</>;
}

export function GrievanceContact() {
  const { site } = useSettings();
  if (!site?.grievance_officer || /sample/i.test(site.grievance_officer)) {
    return <>our support team via WhatsApp</>;
  }
  return (
    <>
      <strong>{site.grievance_officer}</strong>
      {site.grievance_email && !/example\.com/i.test(site.grievance_email) && (
        <>
          ,{" "}
          <a className="text-brand hover:underline" href={`mailto:${site.grievance_email}`}>
            {site.grievance_email}
          </a>
        </>
      )}
      {site.grievance_phone && <>, {site.grievance_phone}</>}
    </>
  );
}
