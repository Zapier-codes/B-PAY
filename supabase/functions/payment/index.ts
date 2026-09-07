// supabase/functions/payment/index.ts
//
// Task 1c (handover.md, "payment.ts -> /pay swap"): this function no longer
// calls Paystack directly. It is now a thin proxy in front of B-Pay-backend's
// POST /api/pay, per the Task 1b decision that B-Pay-backend becomes the sole
// caller of every payment provider this app uses. Kept as an Edge Function
// (rather than removed) so the app<->backend boundary stays behind Supabase
// Auth/RLS, and so the request contract for any future client caller doesn't
// change shape.
//
// This app NEVER sends a `provider` field to B-Pay-backend — not even as a
// temporary default override. Per the product owner's own direct instruction
// and B-Pay-backend's own Task 0: this app, and every business/app that
// integrates B-Pay-backend, only ever describes the transaction (amount,
// currency, action/payment method, etc.); B-Pay-backend's own routing logic
// picks the underlying provider from those params, invisibly, every time.
// The business/app is meant to know B-Pay-backend as its only provider,
// forever — the ten-odd real providers underneath (Korapay, Paystack, ...)
// are an internal implementation detail of that backend, not something a
// caller like this one names, checks, or works around.
//
// Known gap, on B-Pay-backend's side, not this one: as of this session,
// `routes.js`'s ROUTING_RULES.collect_payment still hardcodes Paystack, even
// though the product owner's own stated current default is Korapay (Task 0
// in that repo), via an admin-switchable setting that doesn't exist in code
// yet. That is a bug to fix in B-Pay-backend itself (update the routing
// default, build the actual admin toggle) — it is NOT something this
// function should paper over by sending its own `provider` field. This
// function sends `action: "collect_payment"` (a description of what the
// transaction is, not who handles it) and nothing more specific than that.
//
// Also confirmed against B-Pay-backend's actual routes.js / providers/*.js:
//   - `customer: { email }`, not a top-level `email` — /pay destructures
//     `customer`, and every provider's own processPayment() reads it from
//     there, not from a top-level field.
//   - `amount` is forwarded as-is (major unit, e.g. naira) — B-Pay-backend
//     converts to subunits itself, per-provider, where a provider needs it.
//     This function used to convert to kobo because it *was* the direct
//     Paystack call; doing that here now would be wrong.
//
// Requires two Edge Function secrets, set via `supabase secrets set`:
//   BPAY_BACKEND_URL   e.g. https://b-pay-backend.onrender.com
//   INTERNAL_API_KEY   shared secret B-Pay-backend's requireInternalApiKey expects

import { serve } from 'https://deno.land/std/http/server.ts';

serve(async (req) => {
  const { amount, email, reference, channels } = await req.json();

  const backendUrl = Deno.env.get('BPAY_BACKEND_URL');
  const internalApiKey = Deno.env.get('INTERNAL_API_KEY');

  if (!backendUrl || !internalApiKey) {
    return new Response(
      JSON.stringify({ error: 'Payment backend is not configured' }),
      { status: 500 },
    );
  }

  const res = await fetch(`${backendUrl}/api/pay`, {
    method: 'POST',
    headers: {
      'X-Internal-Api-Key': internalApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // Describes the transaction only — never which provider handles it.
      // B-Pay-backend's own routing picks the provider; this app never
      // names one. See the file header for the known backend-side gap.
      action: 'collect_payment',
      amount, // major unit (naira) — B-Pay-backend converts to subunits itself, per-provider
      customer: { email },
      reference,
      channels, // e.g. ['bank_transfer'] or ['card']
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.message ?? data.error }), { status: 400 });
  }

  // Only ever forward the inner payment payload, never the backend's
  // response envelope (which still includes a top-level `provider` field
  // today) — this app's own clients shouldn't see a provider name either.
  return new Response(JSON.stringify(data.data ?? data), { status: 200 });
});
