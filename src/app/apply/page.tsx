import { Suspense } from "react";
import type { Metadata } from "next";
import { ApplicantPortal } from "@/components/apply/applicant-portal";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Apply",
  description: "Submit your loan application, upload documents, pay the one-time application fee and track your decision.",
};

export default function ApplyPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ApplicantPortal />
    </Suspense>
  );
}
