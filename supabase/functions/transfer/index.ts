// supabase/functions/transfer/index.ts
//
// Formerly `payscribe-transfer` — renamed as part of the full sweep that
// finished Task 1's migration plan (handover.md). The old name was itself
// a violation of Architecture decision C: this app has exactly one
// payment integration, BPay, and no file/folder/function name in this app
// should name an underlying provider. The earlier version of this file
// (already a security fix moving a live secret key out of client code —
// see the git history for the prior header) still called Payscribe's
// `/payouts/transfer` directly, with a real secret key. It now proxies to
// BPay's own `/api/pay` the same way `payment/index.ts` does for
// collections — `action: "bank_transfer"` describes the transaction,
// never which rail carries it.
//
// Requires BPAY_BACKEND_URL / INTERNAL_API_KEY (same secrets `payment`
// and `verify-payment` already use — not new ones for this file).

import { callBpayBackend, jsonResponse, corsHeaders, BackendNotConfiguredError } from "../_shared/bpayBackend.ts";

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
	if (req.method !== "POST") return jsonResponse({ status: false, description: "Only POST is allowed" }, 405);

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return jsonResponse({ status: false, description: "Invalid JSON body" }, 400);
	}

	const { amount, bank_code, account_number, reference, narration } = body as {
		amount?: number;
		bank_code?: string;
		account_number?: string;
		reference?: string;
		narration?: string;
	};

	if (!amount || !bank_code || !account_number || !reference) {
		return jsonResponse(
			{ status: false, description: "amount, bank_code, account_number and reference are required" },
			400,
		);
	}

	try {
		const { ok, status, data } = await callBpayBackend("/api/pay", {
			method: "POST",
			body: {
				action: "bank_transfer",
				amount, // major unit — BPay backend converts to subunits itself, per-rail
				reference,
				recipient: { bank_code, account_number },
				narration,
			},
		});

		if (!ok) {
			return jsonResponse({ status: false, description: (data as any)?.message ?? "Transfer failed" }, status);
		}
		return jsonResponse({ status: true, ...(data as object) }, 200);
	} catch (err) {
		if (err instanceof BackendNotConfiguredError) {
			return jsonResponse({ status: false, description: err.message }, 500);
		}
		return jsonResponse({ status: false, description: (err as Error).message }, 501);
	}
});
