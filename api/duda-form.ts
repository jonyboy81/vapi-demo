// Vercel Edge Function: receives Duda form submission and triggers a Vapi call
export const config = { runtime: "edge" };

// Helper: pull a field from various form payload styles
function extractField(obj: any, ...names: string[]) {
  for (const n of names) if (obj?.[n] != null) return obj[n];
  if (obj?.fields) for (const n of names) if (obj.fields[n] != null) return obj.fields[n];
  const arr = obj?.data?.fields || obj?.fieldsArray || obj?.data;
  if (Array.isArray(arr)) {
    const lower = names.map((n) => n.toLowerCase());
    for (const f of arr) {
      const label = String(f?.label ?? f?.name ?? f?.key ?? "").toLowerCase();
      if (lower.includes(label)) return f?.value;
    }
  }
  return undefined;
}

// Helper: normalize UK phone numbers to E.164
function toE164UK(phone: string) {
  const digits = String(phone).replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("447")) return `+${digits}`;
  if (digits.startsWith("07")) return `+44${digits.slice(1)}`;
  if (/^\d{8,15}$/.test(digits)) return `+${digits}`;
  return digits;
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // ✅ Pull secrets from Vercel env vars
  const VAPI_API_KEY = process.env.VAPI_API_KEY as string;
  const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID as string;
  const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID as string;

  if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500 });
  }

  // Parse the form payload
  const payload = await req.json().catch(() => ({} as any));

  const name =
  extractField(payload, "name", "full name", "your name", "Name")?.toString().trim() || "";
  const phoneRaw =
  extractField(payload, "phone", "mobile", "telephone", "phone number", "Phone", "Mobile Number")?.toString().trim() || "";
  const email =
  extractField(payload, "email", "e-mail", "Email", "Email Address")?.toString().trim() || "";
  const consentVal =
  extractField(payload, "consent", "opt-in", "agree", "Consent", "I agree", "I consent");
  const consent = typeof consentVal === "boolean"
    ? consentVal
    : ["yes","y","1","on","checked","true","agree"].includes(
        String(consentVal ?? "").toLowerCase()
      );

  if (!name) return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 });
  if (!phoneRaw) return new Response(JSON.stringify({ error: "Missing phone" }), { status: 400 });
  if (!consent) return new Response(JSON.stringify({ error: "Consent required" }), { status: 400 });

  const number = toE164UK(phoneRaw);
  if (!/^\+\d{8,15}$/.test(number)) {
    return new Response(JSON.stringify({ error: "Invalid phone format", normalized: number }), { status: 400 });
  }

  // ✅ Call Vapi /call API
  const vapiRes = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VAPI_API_KEY}`,
    },
    body: JSON.stringify({
      type: "outboundPhoneCall",
      assistantId: VAPI_ASSISTANT_ID,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: { number }, // the normalized phone number
      metadata: {
        lead: { name, email, number, source: "duda-form" },
        consentPurpose: "demo-call",
        submittedAt: new Date().toISOString(),
      },
      maxDurationSeconds: 180,
    }),
  });

  if (!vapiRes.ok) {
    const err = await vapiRes.text().catch(() => "");
    return new Response(JSON.stringify({ error: "Vapi call failed", details: err }), { status: 502 });
  }

  const data = await vapiRes.json();
  return new Response(
    JSON.stringify({ ok: true, callId: data.id, message: "Calling you now…" }),
    { status: 200 }
  );
};
