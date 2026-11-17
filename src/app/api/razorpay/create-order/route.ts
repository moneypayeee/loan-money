import { NextResponse } from "next/server";
import { getApplicationFee, razorpayCredentials } from "@/lib/razorpay-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const creds = razorpayCredentials();
    if (!creds) {
      return NextResponse.json(
        { error: "Razorpay credentials are not configured on the server." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    // The fee is decided here on the server — any amount sent by the browser is ignored.
    const fee = await getApplicationFee();
    const amountInPaise = fee * 100;

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds.auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
        notes: {
          purpose: "Loan Application Verification Fee",
          applicant: String(body.applicant_name || "Applicant").slice(0, 100),
          phone: String(body.phone || "").slice(0, 20),
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.description || "Failed to create Razorpay order." },
        { status: response.status }
      );
    }

    return NextResponse.json({
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId: creds.keyId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
