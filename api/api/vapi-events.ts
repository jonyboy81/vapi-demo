// Vercel Edge Function: receives live events from Vapi during/after the call
export const config = { runtime: "edge" };

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const payload = await req.json().catch(() => ({}));
  const msg = payload?.message;
  if (!msg?.type) return new Response("ok");

  // Later: store status/transcripts/summary in your DB/CRM
  // Examples:
  // - status-update: msg.status ('ringing' | 'in-progress' | 'ended')
  // - transcript-update: msg.role ('user'|'assistant'), msg.content
  // - end-of-call-report: msg.summary, msg.outcome

  return new Response("ok");
};
