// supabase/functions/wallet-balance/index.ts
//
// Replaces components/home/WalletCard/index.tsx's direct client-side
// `fetch(`${baseUrl}/wallet/balance`, { headers: { Authorization: `Bearer
// ${publicKey}` } })` call. Identifies the caller from their Supabase auth
// session (not a client-supplied user id) and asks BPay for that user's
// own balance — this app never learns or forwards which underlying
// provider/account actually holds the money.
//
// Requires BPAY_BACKEND_URL / INTERNAL_API_KEY.
// KNOWN GAP: no backend route for this yet — returns 501 until one exists,
// deliberately, rather than falling back to a direct provider call.

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

	try {
		const { ok, status, data } = await callBpayBackend("/api/balance", {
			method: "GET",
			query: { user_id: userData.user.id },
		});

		if (!ok) return jsonResponse({ error: (data as any)?.message ?? "Could not fetch balance" }, status);
		return jsonResponse(data, 200);
	} catch (err) {
		if (err instanceof BackendNotConfiguredError) {
			return jsonResponse({ error: err.message }, 500);
		}
		return jsonResponse({ error: (err as Error).message }, 501);
	}
});
