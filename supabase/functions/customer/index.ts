// supabase/functions/customer/index.ts
//
// Replaces direct client-side calls to Payscribe's customer endpoints,
// all with hardcoded/env-fallback secret keys bundled into the app:
//   - app/(app)/get-tag.tsx                (`/customers/create`)
//   - app/(app)/fund/tabs/TierUpgradeModal.tsx (`/customers/create/tier1`)
//   - hooks/useUserProfile.ts               (`/customers/:id/transactions`
//                                             — moved to `transactions`
//                                             function instead, not here)
//
// `op: "create"` onboards a new customer; `op: "upgrade-tier"` adds KYC
// (e.g. BVN) to an existing one. Neither op names a provider — BPay's own
// routing decides which underlying KYC/customer rail handles it.
//
// Requires BPAY_BACKEND_URL / INTERNAL_API_KEY.
// KNOWN GAP: no backend route for either op yet — returns 501 until one
// exists, deliberately, rather than falling back to a direct call.

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

	const { op } = body as { op?: string };

	try {
		if (op === "create") {
			const { first_name, last_name, email, phone, dob } = body as Record<string, string>;
			if (!first_name || !last_name || !email || !phone) {
				return jsonResponse({ error: "first_name, last_name, email and phone are required" }, 400);
			}
			const { ok, status, data } = await callBpayBackend("/api/customers", {
				method: "POST",
				body: { action: "create_customer", first_name, last_name, email, phone, dob },
			});
			if (!ok) return jsonResponse({ error: (data as any)?.message ?? "Customer creation failed" }, status);
			return jsonResponse(data, 200);
		}

		if (op === "upgrade-tier") {
			const { customer_id, bvn } = body as Record<string, string>;
			if (!customer_id || !bvn) {
				return jsonResponse({ error: "customer_id and bvn are required" }, 400);
			}
			const { ok, status, data } = await callBpayBackend(`/api/customers/${customer_id}/tier`, {
				method: "POST",
				body: { action: "upgrade_customer_tier", identity: { type: "bvn", number: bvn } },
			});
			if (!ok) return jsonResponse({ error: (data as any)?.message ?? "Tier upgrade failed" }, status);
			return jsonResponse(data, 200);
		}

		return jsonResponse({ error: `Unsupported op "${op}"` }, 400);
	} catch (err) {
		if (err instanceof BackendNotConfiguredError) {
			return jsonResponse({ error: err.message }, 500);
		}
		return jsonResponse({ error: (err as Error).message }, 501);
	}
});
