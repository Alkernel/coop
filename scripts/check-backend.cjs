#!/usr/bin/env node
/* ============================================================
 * Backend health check for the COOP support chat.
 *
 *   node scripts/check-backend.cjs
 *
 * Tells you which support RPCs are actually deployed on the live
 * Supabase project, so you can confirm that
 * supabase/migration-v8-support-history.sql has been applied.
 *
 * Safe to run any time: it only calls functions with placeholder
 * (all-zero) IDs, so it never reads or writes real user data.
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const NIL = '00000000-0000-0000-0000-000000000000';

// Read the project URL + anon key straight from .env / .env.local.
function loadEnv() {
  const out = {};
  for (const f of ['.env.local', '.env']) {
    const p = path.join(__dirname, '..', f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const env = loadEnv();
const URL_ = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!URL_ || !KEY) {
  console.error('Could not find VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env or .env.local');
  process.exit(1);
}

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

// name -> exact argument list the web app sends.
const CHECKS = [
  ['rpc_support_open_ticket', { p_wallet_id: NIL, p_name: 'x', p_email: 'x', p_subject: 'x', p_message: 'x' }, 'v7'],
  ['rpc_support_send', { p_ticket_id: NIL, p_wallet_id: NIL, p_body: 'x' }, 'v8'],
  ['rpc_support_poll', { p_ticket_id: NIL, p_wallet_id: NIL }, 'v8'],
  ['rpc_support_typing', { p_ticket_id: NIL, p_wallet_id: NIL, p_admin_key: null }, 'v8'],
  ['rpc_support_my_tickets', { p_wallet_id: NIL }, 'v8'],
  ['rpc_support_end', { p_ticket_id: NIL, p_wallet_id: NIL, p_rating: 5, p_comment: null }, 'v8'],
  ['rpc_support_rate', { p_ticket_id: NIL, p_wallet_id: NIL, p_rating: 5, p_comment: null }, 'v8'],
  ['rpc_support_reopen', { p_ticket_id: NIL, p_wallet_id: NIL }, 'v8'],
  ['rpc_support_delete', { p_ticket_id: NIL, p_wallet_id: NIL }, 'v8'],
  ['rpc_support_admin_list', { p_admin_key: null }, 'v7'],
  ['rpc_support_admin_poll', { p_admin_key: null, p_ticket_id: NIL }, 'v7'],
  ['rpc_support_admin_reply', { p_admin_key: null, p_ticket_id: NIL, p_body: 'x', p_admin_name: 'Test' }, 'v8'],
  ['rpc_support_admin_close', { p_admin_key: null, p_ticket_id: NIL }, 'v7'],
  ['rpc_support_admin_reopen', { p_admin_key: null, p_ticket_id: NIL }, 'v8'],
  ['rpc_support_admin_ratings', { p_admin_key: null }, 'v9'],
  ['rpc_claim_mining', { p_wallet_id: NIL }, 'v7'],
  ['rpc_start_mining', { p_wallet_id: NIL }, 'v7'],
  ['rpc_mining_status', { p_wallet_id: NIL }, 'core']
];

(async () => {
  console.log('Backend: ' + URL_ + '\n');
  const missing = [];
  for (const [fn, body, ver] of CHECKS) {
    let ok = false, note = '';
    try {
      const r = await fetch(URL_ + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers: H, body: JSON.stringify(body)
      });
      const text = await r.text();
      ok = !/PGRST202|Could not find the function/i.test(text);
      // A function that exists but rejects our placeholder input is a PASS.
      note = ok ? (JSON.parse(text || '{}').message || 'reachable') : 'NOT DEPLOYED';
    } catch (e) {
      note = 'network error: ' + e.message;
    }
    if (!ok) missing.push(fn + '  (needs migration ' + ver + ')');
    console.log((ok ? '  OK      ' : '  MISSING ') + fn.padEnd(30) + note.slice(0, 70));
  }

  console.log('');
  if (!missing.length) {
    console.log('All support + mining RPCs are deployed. The app is fully wired.');
  } else {
    console.log('ACTION REQUIRED — these are not on the database yet:');
    for (const m of missing) console.log('  - ' + m);
    // Point at exactly the migration files that are still missing.
    const needed = [...new Set(missing.map(m => (m.match(/\(needs migration ([^)]+)\)/) || [])[1]).filter(Boolean))];
    const files = needed.map(v => {
      const map = {
        v7: 'supabase/migration-v7-claim-support.sql',
        v8: 'supabase/migration-v8-support-history.sql',
        v9: 'supabase/migration-v9-support-ratings.sql'
      };
      return map[v] || v;
    });
    console.log('\nOpen the Supabase Dashboard -> SQL Editor and run these in order:');
    files.forEach(f => console.log('  ' + f));
    console.log('\nThen re-run this script. (v9 also unblocks MINING CLAIM: it rebuilds the');
    console.log('transactions CHECK constraints so currency \'Coopoints\' is accepted.)');
  }
})();
