// supabase/functions/_shared/bpayBackend.ts
//
// One helper, imported by every Edge Function in this app that talks to
// the BPay backend, so the "never send a provider field, ever" rule
// (handover.md, Architecture decision C) is enforced in one place instead
// of re-typed correctly (or incorrectly) in N files.
//
// Required secrets (`supabase secrets set BPAY_BACKEND_URL=... INTERNAL_API_KEY=...`):
//   BPAY_BACKEND_URL   e.g. https://b-pay-backend.onrender.com
//   INTERNAL_API_KEY   shared secret the backend's requireInternalApiKey expects
//
// If either secret is missing, every call through this helper fails loudly
// with a 500 and an explicit "not configured" message — it never silently
// falls back to calling a provider directly from this app.

export class BackendNotConfiguredError extends Error {
	constructor() {
		super("BPAY_BACKEND_URL / INTERNAL_API_KEY is not configured for this Edge Function");
		this.name = "BackendNotConfiguredError";
	}
}

export class BackendNotImplementedError extends Error {
	constructor(path: string) {
		super(
			`BPay backend has no route for ${path} yet. This is backend work that ` +
				`needs to be built there — this Edge Function will not paper over the ` +
				`gap by calling a provider directly.`,
		);
		this.name = "BackendNotImplementedError";
	}
}

/**
 * Calls `<BPAY_BACKEND_URL><path>` with the internal API key attached.
 *
 * `body` must describe the transaction/request only — amount, currency,
 * reference, action, customer — and must NEVER include a `provider` key.
 * This function does not strip one for you; it is the caller's job not to
 * put one there in the first place (see the file header).
 */
export async function callBpayBackend<T = unknown>(
	path: string,
	init: { method?: "GET" | "POST"; body?: Record<string, unknown>; query?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; data: T }> {
	const backendUrl = Deno.env.get("BPAY_BACKEND_URL");
	const internalApiKey = Deno.env.get("INTERNAL_API_KEY");

	if (!backendUrl || !internalApiKey) {
		throw new BackendNotConfiguredError();
	}

	if (init.body && "provider" in init.body) {
		// Fail loudly rather than silently stripping it — a caller that put a
		// provider field here has a bug worth surfacing, not hiding.
		throw new Error(
			`Refusing to call ${path}: request body includes a "provider" field. ` +
				`This app never names a provider — see Architecture decision C in handover.md.`,
		);
	}

	const url = new URL(`${backendUrl}${path}`);
	if (init.query) {
		for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
	}

	const res = await fetch(url.toString(), {
		method: init.method ?? "POST",
		headers: {
			"X-Internal-Api-Key": internalApiKey,
			"Content-Type": "application/json",
		},
		body: init.method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
	});

	const data = await res.json().catch(() => ({}));
	return { ok: res.ok, status: res.status, data: (data.data ?? data) as T };
}

export const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}
