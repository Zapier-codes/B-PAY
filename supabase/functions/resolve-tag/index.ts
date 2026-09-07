// supabase/functions/resolve-tag/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Security/correctness fix (Task 67, mavins-web handover.md): this
// function referenced `supabase` below without ever importing or
// instantiating a client — as originally written, every call would
// throw a ReferenceError at runtime, not a hypothetical concern.
// Matches this repo's own established client-instantiation pattern
// (see supabase/functions/delete-account/index.ts) — SERVICE_ROLE_KEY,
// not the anon key, since this reads bpay_account_number (a
// sensitive field the original code's own comment already flagged as
// "only backend sees this") and needs to bypass RLS reliably
// regardless of whatever policy is set on `profiles`.
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (req) => {
  const { tag } = await req.json();
  if (!tag?.startsWith('@')) return new Response('Invalid tag', { status: 400 });

  const cleanTag = tag.slice(1);

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, bpay_account_number, full_name, bpay_tag')
    .eq('bpay_tag', cleanTag)
    .single();

  if (!profile) return new Response('Tag not found', { status: 404 });

  return new Response(JSON.stringify({
    success: true,
    account_number: profile.bpay_account_number,  // ← real number (only backend sees this)
    name: profile.full_name || 'User',
    tag: `@${profile.bpay_tag}`
  }), { headers: { 'Content-Type': 'application/json' } });
});