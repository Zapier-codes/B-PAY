// supabase/functions/balance-sync/index.ts
//
// Formerly `payscribe_balance` (file header there had already drifted to
// say `sync-payscribe-balance` without the folder being renamed to
// match — this migration fixes both the folder name and the drift).
// Cron/scheduled function: pulls each user's balance from BPay and
// upserts it into `profiles`, instead of calling
// `https://api.payscribe.ng/api/v1/wallet/balance` directly with a
// provider secret key, per-user, from inside this app's own
// infrastructure.
//
// Requires BPAY_BACKEND_URL / INTERNAL_API_KEY.
// KNOWN GAP: BPay backend has no per-customer balance-sync route yet
// (routes.js only has a payout-side `/banks` lookup as of this writing).
// This function is intentionally left calling a route that does not
// exist yet (`/api/balance/sync`) rather than falling back to the direct
// provider call it replaces — the 404s from this function are the
// correct, visible signal that the backend route still needs to be built,
// not something to paper over here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callBpayBackend, BackendNotConfiguredError } from "../_shared/bpayBackend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

Deno.serve(async () => {
	const { data: users, error } = await supabase
		.from("profiles")
		.select("id, bpay_customer_ref")
		.not("bpay_customer_ref", "is", null);

	if (error) {
		console.error("[balance-sync] Could not load profiles:", error.message);
		return new Response("Failed to load profiles", { status: 500 });
	}

	const updates: { id: string; balance: number; last_synced_at: string }[] = [];

	for (const user of users ?? []) {
		if (!user.bpay_customer_ref) continue;

		try {
			const { ok, data } = await callBpayBackend<{ balance: number }>("/api/balance/sync", {
				method: "GET",
				query: { customer_ref: user.bpay_customer_ref },
			});

			if (!ok) {
				console.warn(`[balance-sync] Backend route not available yet for user ${user.id}`);
				continue;
			}

			updates.push({
				id: user.id,
				balance: (data as { balance: number }).balance,
				last_synced_at: new Date().toISOString(),
			});
		} catch (err) {
			if (err instanceof BackendNotConfiguredError) {
				console.error("[balance-sync]", err.message);
				return new Response(err.message, { status: 500 });
			}
			console.error(`[balance-sync] Failed for user ${user.id}:`, (err as Error).message);
		}
	}

	if (updates.length > 0) {
		await supabase.from("profiles").upsert(updates, { onConflict: "id" });
	}

	return new Response(`Sync attempted for ${users?.length ?? 0} users, ${updates.length} updated`, { status: 200 });
});
