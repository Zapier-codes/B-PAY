// supabase/functions/bank-lookup/index.ts
//
// Replaces app/(app)/send/tabs/NGNBanks.tsx's direct client-side call to
// `https://api.payscribe.ng/api/v1/payouts/account/lookup`, authorized
// with a public key read straight out of `process.env` into the compiled
// app. Resolves an account number + bank code to the account name before
// a transfer is confirmed — this app never learns which rail did the
// lookup.
//
// Requires BPAY_BACKEND_URL / INTERNAL_API_KEY.
// KNOWN GAP: no backend route for this yet — returns 501 until one exists.

import { callBpayBackend, jsonResponse, corsHeaders, BackendNotConfiguredError } from "../_shared/bpayBackend.ts";

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
	if (req.method !== "POST") return jsonResponse({ error: "Only POST is allowed" }, 405);

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}

	const { bank_code, account_number } = body as { bank_code?: string; account_number?: string };
	if (!bank_code || !account_number) {
		return jsonResponse({ error: "bank_code and account_number are required" }, 400);
	}

	try {
		const { ok, status, data } = await callBpayBackend("/api/banks/lookup", {
			method: "POST",
			body: { action: "resolve_account", bank_code, account_number },
		});
		if (!ok) return jsonResponse({ error: (data as any)?.message ?? "Account lookup failed" }, status);
		return jsonResponse(data, 200);
	} catch (err) {
		if (err instanceof BackendNotConfiguredError) {
			return jsonResponse({ error: err.message }, 500);
		}
		return jsonResponse({ error: (err as Error).message }, 501);
	}
});
