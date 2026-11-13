"use client";

import { createContext, useContext } from "react";
import { PAYMENT, SITE } from "@/config/site";
import type { PaymentSettings, SiteSettings } from "./types";

type SettingsState = {
  site: SiteSettings | null;
  payment: PaymentSettings | null;
  loading: boolean;
  /** Lender name + RBI registration published → applications are open. */
  disclosed: boolean;
  qrUrl: string | null;
  reload: () => Promise<void>;
};

// Values are fixed in src/config/site.ts; there is nothing to load.
const value: SettingsState = {
  site: SITE,
  payment: PAYMENT,
  loading: false,
  disclosed: Boolean(SITE.lender_name.trim() && SITE.lender_reg_no.trim()),
  qrUrl: PAYMENT.qr_path ? `/${PAYMENT.qr_path}` : null,
  reload: async () => {},
};

const SettingsContext = createContext<SettingsState>(value);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
