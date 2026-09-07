// supabase/functions/international-bill/index.ts
//
// Replaces app/(app)/bundles/tabs/international.tsx's direct client-side
// call to `https://api.payscribe.ng/api/v1/international-bills/vend`,
// authorized with a LIVE secret key (`ps_pk_live_...`) hardcoded in that
// same file. Vends airtime/data/bills to a recipient abroad — this app
// only describes the product and recipient; BPay decides the rail.
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

	const { op, country_iso, product_code, recipient, amount } = body as {
		op?: string;
		country_iso?: string;
		product_code?: string;
		recipient?: string;
		amount?: number;
	};

	if (op !== "vend") return jsonResponse({ error: `Unsupported op "${op}"` }, 400);
	if (!country_iso || !product_code || !recipient || !amount) {
		return jsonResponse({ error: "country_iso, product_code, recipient and amount are required" }, 400);
	}

	try {
		const { ok, status, data } = await callBpayBackend("/api/bills/international", {
			method: "POST",
			body: { action: "vend_international_bill", country_iso, product_code, recipient, amount },
		});
		if (!ok) return jsonResponse({ error: (data as any)?.message ?? "Vend failed" }, status);
		return jsonResponse(data, 200);
	} catch (err) {
		if (err instanceof BackendNotConfiguredError) {
			return jsonResponse({ error: err.message }, 500);
		}
		return jsonResponse({ error: (err as Error).message }, 501);
	}
});
