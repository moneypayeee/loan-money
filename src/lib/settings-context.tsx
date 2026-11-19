"use client";

import { createContext, useContext, useEffect, useState } from "react";
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
  updatePayment: (newPayment: PaymentSettings, customQrUrl?: string | null) => void;
};

const defaultValue: SettingsState = {
  site: SITE,
  payment: PAYMENT,
  loading: false,
  disclosed: true,
  qrUrl: PAYMENT.qr_path ? `/${PAYMENT.qr_path}` : null,
  reload: async () => {},
  updatePayment: () => {},
};

const SettingsContext = createContext<SettingsState>(defaultValue);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [payment, setPayment] = useState<PaymentSettings>(PAYMENT);
  const [qrUrl, setQrUrl] = useState<string | null>(PAYMENT.qr_path ? `/${PAYMENT.qr_path}` : null);
  const [loading] = useState(false);

  const fetchCustomSettings = async () => {
    try {
      const res = await fetch("/api/admin/payment-settings");
      if (res.ok) {
        const data = await res.json();
        if (data.fee !== undefined || data.payee_name || data.upi_id || data.qr_path) {
          setPayment((prev) => ({
            ...prev,
            payee_name: data.payee_name || prev.payee_name,
            upi_id: data.upi_id || prev.upi_id,
            fee: typeof data.fee === "number" ? data.fee : (data.fee !== undefined ? Number(data.fee) : prev.fee),
            qr_path: data.qr_path || prev.qr_path,
          }));
          if (data.qr_url) {
            setQrUrl(data.qr_url);
          } else if (data.qr_path) {
            setQrUrl(data.qr_path.startsWith("/") ? data.qr_path : `/${data.qr_path}?v=${Date.now()}`);
          }
        }
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    void fetchCustomSettings();
  }, []);

  const updatePayment = (newPayment: PaymentSettings & { qr_url?: string | null }, customQrUrl?: string | null) => {
    setPayment(newPayment);
    if (customQrUrl) {
      setQrUrl(customQrUrl);
    } else if (newPayment.qr_url) {
      setQrUrl(newPayment.qr_url);
    } else if (newPayment.qr_path) {
      setQrUrl(newPayment.qr_path.startsWith("/") ? newPayment.qr_path : `/${newPayment.qr_path}?v=${Date.now()}`);
    }
  };

  const val: SettingsState = {
    site: SITE,
    payment,
    loading,
    disclosed: true,
    qrUrl,
    reload: fetchCustomSettings,
    updatePayment,
  };

  return <SettingsContext.Provider value={val}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
