// supabase/functions/payscribe-transfer/index.ts
//
// Security fix (Task 67, mavins-web handover.md): app/(app)/send/
// success.tsx's executePayscribeTransfer() used to call Payscribe's
// /payouts/transfer endpoint directly from client-side app code, with
// a LIVE secret key (`ps_pk_live_...`) hardcoded in that same file —
// a real, exploitable credential capable of authorizing bank
// transfers, bundled into the compiled mobile app and readable in
// plain source on GitHub. This function moves that call server-side:
// the client now calls THIS Edge Function (via supabase.functions.
// invoke, authenticated with the anon key like every other function
// in this repo), and only this function ever holds the real
// Payscribe secret key, read from a server-only environment variable.
//
// Passes through Payscribe's raw JSON response unchanged (same
// pattern as lizzysub-proxy/index.ts) so the client's existing
// response-handling logic (data.status / data.description /
// data.status_code) needs no changes beyond swapping which URL it
// calls.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PAYSCRIBE_BASE_URL = "https://api.payscribe.ng/api/v1";
// Set via `supabase secrets set PAYSCRIBE_SECRET_KEY=ps_pk_live_...`
// -- the RAW key only, no "Bearer " prefix (added below at call time).
// The original client-side constant this replaces awkwardly baked
// "Bearer " into the stored string itself
// (`apiKey: 'Bearer ps_pk_live_...'`) -- not carrying that convention
// forward here, to avoid a future double-prefix mistake if someone
// copies the old value verbatim into this new env var.
const PAYSCRIBE_SECRET_KEY = Deno.env.get("PAYSCRIBE_SECRET_KEY");

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
	if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	try {
		if (!PAYSCRIBE_SECRET_KEY) {
			console.error("payscribe-transfer: PAYSCRIBE_SECRET_KEY is not set");
			return new Response(
				JSON.stringify({
					status: false,
					description: "Server misconfigured (PAYSCRIBE_SECRET_KEY not set)",
				}),
				{
					status: 500,
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				},
			);
		}

		if (req.method !== "POST") {
			return new Response(
				JSON.stringify({ status: false, description: "Only POST method is allowed" }),
				{
					status: 405,
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				},
			);
		}

		// Same request shape executePayscribeTransfer() already builds --
		// amount, bank, account, currency, narration, ref -- forwarded
		// as-is, not reshaped, so the client change is minimal (only the
		// URL and Authorization header move).
		const requestBody = await req.json();

		const response = await fetch(`${PAYSCRIBE_BASE_URL}/payouts/transfer`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${PAYSCRIBE_SECRET_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
		});

		const responseData = await response.json();

		return new Response(JSON.stringify(responseData), {
			status: response.status,
			headers: { ...corsHeaders, "Content-Type": "application/json" },
		});
	} catch (err) {
		console.error("payscribe-transfer proxy error:", err);
		return new Response(
			JSON.stringify({
				status: false,
				description: err instanceof Error ? err.message : "Unknown error occurred",
			}),
			{
				status: 500,
				headers: { ...corsHeaders, "Content-Type": "application/json" },
			},
		);
	}
});
