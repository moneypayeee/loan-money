import { ADMIN_SECTIONS } from "@/lib/admin-sections";

export const dynamicParams = false;

export function generateStaticParams() {
  return ADMIN_SECTIONS.filter((section) => section !== "overview").map((section) => ({ section }));
}

export default function AdminSectionPage() {
  return null;
}
