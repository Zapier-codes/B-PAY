// supabase/functions/transactions/index.ts
//
// Replaces hooks/useUserProfile.ts's direct client-side call to
// `https://sandbox.payscribe.ng/api/v1/customers/:id/transactions`, with
// a hardcoded test secret key. Identifies the caller from their Supabase
// auth session rather than trusting a client-supplied customer id.
//
// Requires BPAY_BACKEND_URL / INTERNAL_API_KEY.
// KNOWN GAP: no backend route for this yet — returns 501 until one exists.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callBpayBackend, jsonResponse, corsHeaders, BackendNotConfiguredError } from "../_shared/bpayBackend.ts";

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

	const authHeader = req.headers.get("Authorization");
	if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

	const supabase = createClient(
		Deno.env.get("SUPABASE_URL")!,
		Deno.env.get("SUPABASE_ANON_KEY")!,
		{ global: { headers: { Authorization: authHeader } } },
	);

	const { data: userData, error: userError } = await supabase.auth.getUser();
	if (userError || !userData?.user) return jsonResponse({ error: "Not authenticated" }, 401);

	let body: Record<string, unknown> = {};
	if (req.method === "POST") {
		body = await req.json().catch(() => ({}));
	}
	const page = (body.page as number) ?? 1;
	const pageSize = (body.page_size as number) ?? 20;

	try {
		const { ok, status, data } = await callBpayBackend("/api/transactions", {
			method: "GET",
			query: { user_id: userData.user.id, page: String(page), page_size: String(pageSize) },
		});
		if (!ok) return jsonResponse({ error: (data as any)?.message ?? "Could not fetch transactions" }, status);
		return jsonResponse(data, 200);
	} catch (err) {
		if (err instanceof BackendNotConfiguredError) {
			return jsonResponse({ error: err.message }, 500);
		}
		return jsonResponse({ error: (err as Error).message }, 501);
	}
});
