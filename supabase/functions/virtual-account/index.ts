// supabase/functions/virtual-account/index.ts
//
// Replaces THREE separate places that used to call Payscribe's
// `/collections/virtual-accounts/create` directly from client-side app
// code, with a LIVE/test secret key bundled into the compiled app:
//   - hooks/useVirtualAccount.ts
//   - app/(app)/fund/index.tsx
//   - app/(app)/fund/tabs/TierUpgradeModal.tsx
//
// Per Architecture decision C (handover.md): this app never names, calls,
// or holds a credential for a provider. It describes what it wants
// ("create a collection account for this customer") and BPay decides how.
//
// Requires BPAY_BACKEND_URL / INTERNAL_API_KEY (see _shared/bpayBackend.ts).
// KNOWN GAP: BPay backend does not yet expose a virtual-account route.
// Until it does, this intentionally returns 501 rather than falling back
// to a direct provider call — that fallback is the exact pattern this
// migration exists to remove. Build the backend route; do not route
// around this file.

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

	const { op, customer_id, bvn } = body as { op?: string; customer_id?: string; bvn?: string };

	if (op !== "create") {
		return jsonResponse({ error: `Unsupported op "${op}"` }, 400);
	}
	if (!customer_id) {
		return jsonResponse({ error: "customer_id is required" }, 400);
	}

	try {
		const { ok, status, data } = await callBpayBackend("/api/accounts", {
			method: "POST",
			body: {
				action: "create_collection_account",
				currency: "NGN",
				customer_id,
				...(bvn ? { identity: { type: "bvn", number: bvn } } : {}),
			},
		});

		if (!ok) return jsonResponse({ error: (data as any)?.message ?? "Account creation failed" }, status);
		return jsonResponse(data, 200);
	} catch (err) {
		if (err instanceof BackendNotConfiguredError) {
			return jsonResponse({ error: err.message }, 500);
		}
		return jsonResponse({ error: (err as Error).message }, 501);
	}
});
