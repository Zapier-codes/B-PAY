// supabase/functions/paystack-webhook/index.ts
//
// ============================================================================
// WHY THIS FILE STILL NAMES A PROVIDER — the one narrow, documented
// exception to Architecture decision C (handover.md), not a loophole:
//
// Paystack's own dashboard has this Edge Function's URL configured as its
// webhook destination. That URL is a manual setting inside Paystack's
// dashboard, outside this repo and outside any sandbox's reach — renaming
// or deleting this function does not move it, it just breaks inbound
// payment confirmations silently (a dropped webhook fails silently, not
// loudly, which is worse). The correct end state is for Paystack's
// dashboard to point directly at BPay's own backend
// (`/api/webhooks/paystack`), never at this app at all — **that manual
// re-point is a required next step, not something this patch can do**.
// Until it happens, this function stays alive purely as a relay.
//
// Everything this file is allowed to do, permanently, until the re-point:
//   1. Verify the inbound Paystack signature (the one legitimate reason a
//      provider-specific secret exists in this app at all — authenticating
//      an inbound request, not making a business decision).
//   2. Forward the verified, untouched payload to BPay's own
//      `/api/webhooks/paystack`.
//   3. Return whatever BPay responds.
//
// It does NOT do — and previously, wrongly, did — any of: fee calculation,
// transaction lookup/matching, wallet crediting, or any other business
// logic. All of that now belongs to BPay, exactly once, not duplicated
// here and in BPay both. If this function's error logs ever show it being
// asked to do more than relay, that's a sign this file is being repurposed
// wrong, not a sign to add the logic back.
// ============================================================================
//
// Requires:
//   PAYSTACK_SECRET_KEY   only ever used to verify the inbound signature
//   BPAY_BACKEND_URL, INTERNAL_API_KEY   same secrets every other proxy
//                                        function in this app already uses

import { callBpayBackend, BackendNotConfiguredError } from "../_shared/bpayBackend.ts";

const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405 });
	}

	const signature = req.headers.get("x-paystack-signature");
	if (!signature) {
		return new Response("Unauthorized", { status: 401 });
	}

	const bodyArrayBuffer = await req.arrayBuffer();
	const rawBody = new TextDecoder().decode(bodyArrayBuffer);

	const valid = await verifyPaystackSignature(rawBody, signature);
	if (!valid) {
		return new Response("Unauthorized", { status: 401 });
	}

	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return new Response("Invalid payload", { status: 400 });
	}

	try {
		const { ok, status, data } = await callBpayBackend("/api/webhooks/paystack", {
			method: "POST",
			body: payload as Record<string, unknown>,
		});
		return new Response(JSON.stringify(data), {
			status: ok ? 200 : status,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		if (err instanceof BackendNotConfiguredError) {
			console.error("[paystack-webhook]", err.message);
			return new Response(err.message, { status: 500 });
		}
		console.error("[paystack-webhook] Relay failed:", (err as Error).message);
		return new Response("Relay to BPay backend failed", { status: 502 });
	}
});

async function verifyPaystackSignature(rawBody: string, signature: string): Promise<boolean> {
	try {
		const encoder = new TextEncoder();
		const key = encoder.encode(paystackSecretKey);

		const cryptoKey = await crypto.subtle.importKey(
			"raw",
			key,
			{ name: "HMAC", hash: "SHA-512" },
			false,
			["verify"],
		);

		const expectedSignatureBytes = hexToBytes(signature);
		const bodyBytes = encoder.encode(rawBody);

		return await crypto.subtle.verify("HMAC", cryptoKey, expectedSignatureBytes, bodyBytes);
	} catch (err) {
		console.error("Signature verification failed:", err);
		return false;
	}
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
	}
	return bytes;
}
