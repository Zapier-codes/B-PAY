// supabase/functions/verify-payment/index.ts
//
// Formerly `verify-paystack-transaction` — renamed as part of this patch.
// The old name was itself a violation of the rule below: this app has
// exactly one payment integration, B-Pay-backend, and no file, folder,
// variable, or log line in this app should name an underlying provider as
// if this app talks to it. It doesn't, anywhere, on purpose.
//
// Task 1c (handover.md): this function no longer calls Paystack (or any
// provider) directly. It is a thin proxy in front of B-Pay-backend's
// GET /api/verify, per the Task 1b decision that B-Pay-backend becomes the
// sole caller of every payment provider this app uses. Kept as an Edge
// Function (not removed) so the app<->backend boundary stays behind
// Supabase Auth/RLS, and the DB side-effects below (marking the
// transaction row, crediting the wallet, recording the deposit) stay
// where they already lived — this patch only swaps *how B-Pay-backend is
// reached*, not the ledger/DB logic around it (that belongs to Task 2,
// not this one).
//
// ============================================================================
// STANDING RULE — binding on this file and every other payment-adjacent
// file in this app, restated here because an earlier draft of this same
// handover.md's own migration plan got it wrong at this exact spot:
//
//   B-PAY-BACKEND IS THE ONLY PAYMENT PROVIDER THIS APP KNOWS ABOUT.
//   PERIOD. This app does not call, name, reference, log, hold a
//   credential for, or hardcode a fallback to any underlying provider —
//   not Paystack, not Payscribe, not Korapay, not Juicyway, not whatever
//   Task 0 (B-Pay-backend's own file) adds next. Those are B-Pay-
//   backend's internal implementation detail, permanently, the same way
//   an app doesn't know or care which bank rail Stripe uses underneath.
//   That includes:
//     - never sending a `provider` field or query param to B-Pay-backend,
//       under any circumstance — not as a default, not as a "just this
//       one endpoint needs it" exception, not as a workaround for a
//       backend gap;
//     - never naming a provider in a function/file/folder name in this
//       app (a rename this same patch applies to this file);
//     - never reading, forwarding, or logging a `provider` field that
//       happens to come back in a B-Pay-backend response envelope.
//   This app describes the transaction (reference, action, amount,
//   currency) — B-Pay-backend decides which of its own providers
//   handles it, invisibly, every time. Any future session that finds
//   itself typing a provider's name into this app's own code — even to
//   "fix" a 400, even temporarily — has the fix in the wrong repo. The
//   fix belongs in B-Pay-backend.
//
// This file previously (in an earlier draft of this handover.md's own
// Task 1c migration plan) said this endpoint would call
// `GET /api/verify?reference=...&provider=paystack` — that line has been
// removed, and the file itself renamed off `verify-paystack-transaction`,
// for the same reason: naming a provider from this app's side at all
// contradicts the point of this migration, not just the specific field
// name used to do it.
//
// KNOWN GAP (B-Pay-backend's side, not this one, and not papered over
// from here): as of this session, B-Pay-backend's `GET /api/verify`
// still requires an explicit `provider` query param and returns 400
// without one — there is no reference/action-based verification lookup
// yet. Because this app never learns which provider actually handled a
// given collection (that decision happens invisibly inside B-Pay-backend
// at /pay time), this app has no correct value it could supply even if
// the rule above didn't already forbid trying. Concretely:
// **verification through this function will 400 against the live
// backend until B-Pay-backend adds a provider-agnostic verify lookup
// keyed on reference alone.** That is a real, currently-open cross-repo
// blocker to file on B-Pay-backend, not something to hide by guessing or
// hardcoding a provider value here. Do not "fix" the resulting 400 by
// adding `provider` back into this file, or into any other file in this
// app — fix it in B-Pay-backend.
// ============================================================================
//
// Requires two Edge Function secrets, set via `supabase secrets set`
// (same two payment/index.ts already needs — not new ones for this file):
//   BPAY_BACKEND_URL   e.g. https://b-pay-backend.onrender.com
//   INTERNAL_API_KEY   shared secret B-Pay-backend's requireInternalApiKey expects
//
// PAYSTACK_SECRET_KEY is intentionally no longer read here — this function
// no longer holds a provider credential at all, B-Pay-backend does.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BPAY_BACKEND_URL = Deno.env.get("BPAY_BACKEND_URL");
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY");

serve(async (req: Request) => {
  console.log(`Edge Function invoked at: ${new Date().toISOString()}`, { method: req.method, url: req.url });

  try {
    console.log("Environment variables:", {
      BPAY_BACKEND_URL: BPAY_BACKEND_URL || "Missing",
      INTERNAL_API_KEY: INTERNAL_API_KEY ? "Set" : "Missing",
      SUPABASE_URL: SUPABASE_URL || "Missing",
      SUPABASE_SERVICE_KEY: SUPABASE_SERVICE_KEY ? "Set (eyJ...)" : "Missing",
    });

    if (!BPAY_BACKEND_URL || !INTERNAL_API_KEY) {
      console.error("Payment backend is not configured");
      return new Response(
        JSON.stringify({ error: "Payment backend is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error("Missing Supabase configuration", { SUPABASE_URL, SUPABASE_SERVICE_KEY });
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    let body;
    try {
      body = await req.json();
      console.log("Request body:", { reference: body.reference, expectedAmount: body.expectedAmount });
    } catch (error) {
      console.error("Failed to parse request body:", error.message);
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { reference, expectedAmount } = body;
    if (!reference || typeof expectedAmount !== "number") {
      console.error("Invalid request parameters", { reference, expectedAmount });
      return new Response(
        JSON.stringify({ error: "Reference and expectedAmount required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    console.log("Initializing Supabase client");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify via B-Pay-backend — reference only, deliberately never a
    // `provider` param. See the file header's "Known gap" note: this will
    // 400 until B-Pay-backend's own /api/verify supports a provider-agnostic
    // lookup. That 400 is expected and correct to surface, not to hide.
    console.log(`Verifying transaction via B-Pay-backend: ${reference}`);
    const verifyUrl = `${BPAY_BACKEND_URL}/api/verify?reference=${encodeURIComponent(reference)}`;
    const response = await fetch(verifyUrl, {
      method: "GET",
      headers: {
        "X-Internal-Api-Key": INTERNAL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const backendJson = await response.json();

    if (!response.ok) {
      console.error("B-Pay-backend verification call failed:", {
        reference,
        status: response.status,
        body: backendJson,
      });
      return new Response(
        JSON.stringify({
          status: false,
          error: backendJson?.error ?? backendJson?.message ?? "Verification failed",
        }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // B-Pay-backend forwards the underlying provider's raw verify payload
    // under `.data` (same envelope shape as /pay's response) — this
    // function never reads or forwards any `provider` field from that
    // envelope either, same principle as payment/index.ts.
    const data = backendJson.data ?? backendJson;
    console.log("Verification response:", {
      reference,
      status: data.status,
      providerStatus: data.data?.status,
      paidAmount: data.data?.amount ? data.data.amount / 100 : null,
      expectedAmount,
    });

    if (data.status && data.data.status === "success") {
      const paidAmount = data.data.amount / 100;
      if (Math.abs(paidAmount - expectedAmount) <= 0.01) {
        console.log(`Updating transaction: ${reference}`);
        let attempts = 0;
        const maxAttempts = 3;
        let txUpdateError = null;

        while (attempts < maxAttempts) {
          // Begin transaction update
          const { data: txData, error } = await supabase
            .from("transactions")
            .update({
              status: "success",
              metadata: {
                ...data.data.metadata,
                verification_response: data.data,
                verification_date: new Date().toISOString(),
                paid_amount: paidAmount,
                net_amount: paidAmount * 0.9,
                profit: paidAmount * 0.1,
              },
            })
            .eq("reference", reference)
            .select()
            .single();

          if (!error && txData) {
            console.log("Transaction updated:", { reference, transaction: txData });

            // Update wallet balance
            const { data: wallet, error: walletError } = await supabase
              .from("wallets")
              .select("balance")
              .eq("user_email", txData.user_email)
              .single();

            if (walletError && walletError.code !== "PGRST116") {
              console.error("Wallet query failed:", { error: walletError.message });
              return new Response(
                JSON.stringify({ error: `Wallet query failed: ${walletError.message}` }),
                { status: 500, headers: { "Content-Type": "application/json" } }
              );
            }

            const currentBalance = wallet?.balance || 0;
            const newBalance = currentBalance + paidAmount * 0.9;

            console.log("Updating wallet:", { userEmail: txData.user_email, newBalance });
            const { error: walletUpdateError } = await supabase
              .from("wallets")
              .upsert(
                { user_email: txData.user_email, balance: newBalance },
                { onConflict: ["user_email"] }
              );

            if (walletUpdateError) {
              console.error("Wallet update failed:", { error: walletUpdateError.message });
              return new Response(
                JSON.stringify({ error: `Wallet update failed: ${walletUpdateError.message}` }),
                { status: 500, headers: { "Content-Type": "application/json" } }
              );
            }

            // Insert deposit record
            console.log("Inserting deposit:", { transactionId: txData.id });
            const { error: depositError } = await supabase
              .from("deposits")
              .insert({
                transaction_id: txData.id,
                user_email: txData.user_email,
                amount: paidAmount,
                profit: paidAmount * 0.1,
                net_amount: paidAmount * 0.9,
                reference,
              });

            if (depositError) {
              console.error("Deposit insert failed:", { error: depositError.message });
              return new Response(
                JSON.stringify({ error: `Deposit insert failed: ${depositError.message}` }),
                { status: 500, headers: { "Content-Type": "application/json" } }
              );
            }

            return new Response(
              JSON.stringify({ status: true, transaction: txData, balance: newBalance }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }

          txUpdateError = error;
          attempts++;
          console.warn(`Update attempt ${attempts} failed:`, { error: error?.message, reference });
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        console.error("Failed to update transaction:", { error: txUpdateError?.message, reference });
        return new Response(
          JSON.stringify({ error: `Failed to update transaction: ${txUpdateError?.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      } else {
        console.error("Amount mismatch:", { reference, paidAmount, expectedAmount });
        const { error: txUpdateError } = await supabase
          .from("transactions")
          .update({
            status: "failed",
            metadata: {
              ...data.data.metadata,
              error: `Amount mismatch: Expected ₦${expectedAmount}, Received ₦${paidAmount}`,
              verification_date: new Date().toISOString(),
            },
          })
          .eq("reference", reference);

        if (txUpdateError) {
          console.error("Failed to mark transaction as failed:", { error: txUpdateError.message });
        }

        return new Response(
          JSON.stringify({ status: false, error: `Amount mismatch: Expected ₦${expectedAmount}, Received ₦${paidAmount}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      console.error("Verification failed:", { reference, message: data.message });
      const { error: txUpdateError } = await supabase
        .from("transactions")
        .update({
          status: "failed",
          metadata: {
            ...data.data?.metadata,
            error: data.message || "Verification failed",
            verification_date: new Date().toISOString(),
          },
        })
        .eq("reference", reference);

      if (txUpdateError) {
        console.error("Failed to mark transaction as failed:", { error: txUpdateError.message });
      }

      return new Response(
        JSON.stringify({ status: false, error: data.message || "Verification failed" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Edge Function error:", {
      message: error.message,
      stack: error.stack,
      reference: (await req.json().catch(() => ({ reference: "unknown" }))).reference,
    });
    return new Response(
      JSON.stringify({ error: "Server error: Failed to verify transaction" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
