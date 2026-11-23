export const ADMIN_SECTIONS = [
  "overview",
  "customers",
  "applications",
  "kyc",
  "loans",
  "fees",
  "referrals",
  "activity",
  "reports",
  "team",
  "settings",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export function adminSectionHref(section: AdminSection) {
  return section === "overview" ? "/admin" : `/admin/${section}`;
}
