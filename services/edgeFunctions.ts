// services/edgeFunctions.ts
//
// ============================================================================
// THE BPAY SERVICE LAYER — read this before adding or changing anything here.
// ============================================================================
//
// BPay is this app's payment infrastructure, full stop. It is not "the
// current backend this app happens to call" — as far as this app, or any
// other business/app built on the same platform, is concerned, BPay *is*
// the provider. The real rails BPay routes to underneath (Paystack,
// Payscribe, Korapay, whichever others get added later) are BPay's own
// implementation detail, the same way an app built on Stripe doesn't know
// or care which card networks or banks Stripe settles through underneath.
//
// Two rules, both binding on every function in this file and on every
// caller of this file, permanently:
//
//   1. NOTHING IN THIS APP NAMES, SELECTS, OR FALLS BACK TO A PROVIDER.
//      No `provider` field is ever sent in a request body or query string —
//      not a real provider name, not a "temporary default," not a
//      workaround for a gap in BPay's own routing. This app describes the
//      transaction (amount, currency, action); BPay decides which rail
//      handles it, invisibly, every time. If a future change to this file
//      finds itself typing a provider's name into a request, a variable, a
//      log line, or a function name — stop. That fix belongs in the BPay
//      backend, not here.
//
//   2. NO SCREEN OR COMPONENT TALKS TO THE NETWORK DIRECTLY. Every Edge
//      Function this app calls is wrapped exactly once, here. Screens,
//      hooks, and stores import `bpay` from this file and call a named
//      method (`bpay.pay(...)`, `bpay.createVirtualAccount(...)`) — they
//      never construct their own `fetch()` or call
//      `supabase.functions.invoke(...)` inline. This is what makes it
//      possible to answer "does anything in this app still call a provider
//      directly?" by reading one file instead of grepping the whole repo.
//
// Every method below is a thin, typed wrapper around exactly one Supabase
// Edge Function. The Edge Functions themselves are the only place a BPay
// backend URL or credential is allowed to live (server-side environment
// variables — never bundled into the client). See each function's own
// `supabase/functions/<name>/index.ts` for what it proxies to.
//
// If a call below returns a "not implemented" / 501-style error, that is
// intentional, not a bug to route around client-side: it means the BPay
// backend doesn't expose that capability yet. The fix is to build it on
// the backend, not to add a direct provider call back into this app.
// ============================================================================

import { supabase } from "@/config/supabase";

export class BPayError extends Error {
	readonly action: string;
	readonly status?: number;

	constructor(message: string, action: string, status?: number) {
		super(message);
		this.name = "BPayError";
		this.action = action;
		this.status = status;
	}
}

async function invoke<T = unknown>(
	functionName: string,
	body?: Record<string, unknown>,
): Promise<T> {
	const { data, error } = await supabase.functions.invoke(functionName, {
		body: body ?? {},
	});

	if (error) {
		throw new BPayError(
			error.message || `BPay request to "${functionName}" failed`,
			functionName,
		);
	}

	if (data && typeof data === "object" && "error" in data && data.error) {
		throw new BPayError(String(data.error), functionName);
	}

	return data as T;
}

// ---------------------------------------------------------------------------
// Types — describe the transaction, never the rail that will carry it.
// ---------------------------------------------------------------------------

export interface CollectPaymentInput {
	amount: number; // major unit (e.g. naira) — never pre-converted client-side
	currency?: string; // defaults to the user's local currency server-side
	reference: string;
	customer: { email: string };
	channels?: string[]; // e.g. ['bank_transfer'], ['card']
}

export interface TransferInput {
	amount: number;
	currency?: string;
	reference: string;
	bank_code: string;
	account_number: string;
	narration?: string;
}

export interface VirtualAccountInput {
	customer_id: string;
	bvn?: string;
}

export interface VirtualAccount {
	account_number: string;
	account_name: string;
	bank_name: string;
	bank_code: string;
	currency: string;
}

export interface CreateCustomerInput {
	first_name: string;
	last_name: string;
	email: string;
	phone: string;
	dob?: string;
}

export interface UpgradeCustomerTierInput {
	customer_id: string;
	bvn: string;
}

export interface BankLookupInput {
	bank_code: string;
	account_number: string;
}

export interface BankLookupResult {
	account_name: string;
	account_number: string;
	bank_code: string;
}

export interface InternationalBillInput {
	country_iso: string;
	product_code: string;
	recipient: string;
	amount: number;
}

// ---------------------------------------------------------------------------
// The BPay client — the only surface the rest of the app is allowed to use.
// ---------------------------------------------------------------------------

export const bpay = {
	/** Collect money from a user (deposit / pay-in). Proxies to `payment`. */
	pay: (input: CollectPaymentInput) =>
		invoke<{ authorization_url?: string; reference: string }>(
			"payment",
			input as unknown as Record<string, unknown>,
		),

	/** Confirm a collection. Proxies to `verify-payment`. */
	verifyPayment: (reference: string) =>
		invoke<{ status: string; amount: number }>("verify-payment", {
			reference,
		}),

	/** Send money out (payout / send / withdrawal). Proxies to `transfer`. */
	transfer: (input: TransferInput) =>
		invoke<{ reference: string; status: string }>(
			"transfer",
			input as unknown as Record<string, unknown>,
		),

	/** Create (or fetch) a user's collection account details. */
	createVirtualAccount: (input: VirtualAccountInput) =>
		invoke<VirtualAccount>("virtual-account", {
			op: "create",
			...input,
		}),

	/** Current wallet / collection-account balance for the signed-in user. */
	getWalletBalance: () => invoke<{ balance: number; currency: string }>("wallet-balance"),

	/** Onboard a new customer record. */
	createCustomer: (input: CreateCustomerInput) =>
		invoke<{ customer_id: string }>("customer", {
			op: "create",
			...input,
		}),

	/** Upgrade a customer's KYC tier (e.g. adding BVN). */
	upgradeCustomerTier: (input: UpgradeCustomerTierInput) =>
		invoke<{ customer_id: string; tier: string }>("customer", {
			op: "upgrade-tier",
			...input,
		}),

	/** Resolve an account number + bank code to an account name before a transfer. */
	lookupBankAccount: (input: BankLookupInput) =>
		invoke<BankLookupResult>("bank-lookup", input as unknown as Record<string, unknown>),

	/** Buy airtime/data/bills for a recipient abroad. */
	vendInternationalBill: (input: InternationalBillInput) =>
		invoke<{ reference: string; status: string }>("international-bill", {
			op: "vend",
			...input,
		}),

	/** Transaction history for the signed-in user/customer. */
	getTransactions: (params?: { page?: number; page_size?: number }) =>
		invoke<{ transactions: unknown[] }>("transactions", params as Record<string, unknown>),

	/** Resolve a $BPAY tag to the account it belongs to. */
	resolveTag: (tag: string) => invoke<{ account_number: string; name: string; tag: string }>(
		"resolve-tag",
		{ tag },
	),
};

export default bpay;
