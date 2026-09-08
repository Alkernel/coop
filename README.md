# COOP Wallet - Mine. Trade. Grow.

A decentralized pre-TGE mining and non-custodial wallet web app built with React + Vite + TypeScript, and backed by Supabase.

---

## Deploy to Vercel (recommended)

Everything is already configured (`vercel.json`, `.gitignore`, `vite.config.ts`).

1. Push your code to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** and import that repo.
   - Vercel auto-detects Vite → Framework Vite, Build Command `npm run build`, Output `dist`. Leave the defaults.
3. Add Environment Variables in **Settings → Environment Variables**:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://xkmnodecehgpnssdctvk.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable__Ddgj3Yzj7CHXWeBZFQ36g_XOW2sIAL` |

4. Deploy. The `dist` output is served,and all routes rewrite to `index.html` via `vercel.json`.

> `.env` and `.env.local` are git-ignored, so re-add themin Vercel's dashboard. Vite inlines `VITE_*` vars at build time,and re-deploy if you change them.



### Deploy to GitHub Pages (alternative)

1. Add `"homepage"` to `package.json`. (Not needed for Vercel.)
2. Install `gh-pages` and add the scripts (optional):
   ```json
   "predeploy": "npm run build",
   "deploy": "gh-pages -d dist"
   ```
3. Push to GitHub, enable Pages,and pick the `gh-pages` branch.



## Set up Supabase (the database tables)

Your repo contains the complete schema at **`supabase/schema.sql`** — it creates all tables and server-side RPC functions (mining, swap, send, tasks, admin settings, reward pool). Run it once in your Supabase project:

1. Open the Supabase Dashboard → select your project → **SQL Editor**.
2. Click **New query**, paste the whole `supabase/schema.sql` file, press **Run**.
3. Done. All balances, mining sessions and swaps are executed by database functions using the **server clock** — the browser is never the source of truth.

### Admin configuration

All economic parameters (mining rate, daily hours, conversion ratio, COOP reward pool, boost tiers, feature flags) live in the `admin_settings` table and can only be changed by an authorized admin key:

1. Choose a strong admin secret and compute its SHA-256 hash (e.g. in PowerShell:
   `"%YOUR-SECRET%" | Out-Null; -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("%YOUR-SECRET%")) | ForEach-Object { $_.ToString("x2") })`).
2. In the SQL editor run: `update admin_settings set admin_key_hash = '<sha256-hex>';`
3. The app's `dbService.adminSetSettings(adminKey, updates)` RPC verifies the hash server-side; anything else is rejected.

### Key rules enforced server-side

- Mining: 50 Coopoints/hour base (configurable), max 12 hours per UTC day (600/day). Start/stop sessions persist in the DB; rewards are computed with the server clock when the user claims.
- Boosts (Starter/Plus/Pro/Max) increase mining rate only — they never bypass the 12-hour daily cap. USDT boost purchase is **Coming Soon** (not live).
- Swap: 10 Coopoints = 1 COOP (1,000 → 100), bidirectional, atomic, checked against the admin-controlled COOP reward pool; failed conversions never touch the user's points.
- Anti-abuse: one-time swap nonces, per-second rate limit, daily conversion limit, RLS is read-only for clients — all writes go through security-definer RPCs.



### What tables does the schema create? (the "user table"）

There is **no separate `users` table on purpose** — the **wallet record is your user record**. Each row in `public.wallets` is one user account:

| Table | Purpose |
|---|---|
| `public.wallets` | The user table. One row per account (public address, hashed private key, COOP/Coopoints balances, PIN, settings). |
| `public.admin_settings` | All economic parameters + the COOP reward/emission pool (admin-controlled). |
| `public.mining_sessions` | Mining sessions per wallet with server timestamps and daily-quota caps. |
| `public.boosts` | Active boost grants (tier, pct, start, expiry). |
| `public.boost_purchases` | Boost purchase records (USDT payments — pending/Coming Soon). |
| `public.swap_requests` | One-time swap nonces (anti-replay / duplicate protection). |
| `public.tasks` | The always-available task catalog (seeded with 5 tasks). |
| `public.user_tasks` | Per-wallet task progress (who claimed what). |
| `public.transactions` | Full send/swap/mining/boost/task history with points leg + direction. |

Server-side RPCs (`rpc_authenticate_wallet`, `rpc_mining_status`, `rpc_start_mining`, `rpc_stop_mining`, `rpc_execute_swap`, `rpc_get_settings`, `rpc_admin_set_settings`, `rpc_execute_send`, `rpc_claim_task_reward`) handle all atomic, server-validated writes. RLS is **read-only** for clients — balances and rewards can never be modified from the browser.



## Local development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # typecheck + production build into dist/
npm run preview     # serve the build locally
```

Pre-requisite for local Supabase: a `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`)。



## Security note

- The private key never leaves the browser for ops — only its **SHA-256 hash** is stored in `public.wallets.private_key_hash`.
- The browser is never the source of truth for balances, mining or swaps: only the private key (for session restore) and UI preferences are kept locally. All financial state lives in Supabase and is validated by server-side RPC functions. If the backend is unreachable, the app shows an error instead of faking data.
