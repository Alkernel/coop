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

Your repo already contains the full schema at **`supabase/schema.sql`** — it creates **6 tables** and **7 stored-procedure functions**. Run it once in your Supabase project:

1. Open the Supabase Dashboard → select your project → **SQL Editor**.
2. Click **New query**, open `supabase/schema.sql` from this repo,and paste the whole filein:
3. Press **Run**. You will see output like `CREATE TABLE` and `CREATE FUNCTION`。
4. Done. Verify with:
   ```sql
   select * from public.wallets;
   select * from public.tasks;
   ```

> I cannot run this for you remotely — it must run **inside your Supabase project**, because it needs database/owner access that only your dashboard or service-role key has. The schema is complete and verified against what the app expects。</p>



### What tables does the schema create? (the "user table"）

There is **no separate `users` table on purpose** — the **wallet record is your user record**. Each row in `public.wallets` is one user account:

| Table | Purpose |
|---|---|
| `public.wallets` | The user table. One row per account(public address, hashed private key, COOP/Cooptoken balances, PIN, settings). |
| `public.mining_sessions` | 12-hour mining cycles per wallet. |
| `public.boost_purchases` | Paid price-boost upgrades. |
| `public.tasks` | The always-available task catalog (seeded with 5 tasks). |
| `public.user_tasks` | Per-wallet task progress(who claimed what)。 |
| `public.transactions` | Full send/swap/mining/boost/task history. |

The RPC stored procedures (`rpc_authenticate_wallet`, `rpc_start_mining`, `rpc_claim_mining_reward`, `rpc_execute_swap`, `rpc_execute_send`, `rpc_purchase_boost`, `rpc_claim_task_reward`) handle atomic,server-validated writes,and RLS is enabled with permissive policies for the demo。</p>



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
- If Supabase is unreachable or not set up,the app gracefully falls back to **localStorage**,so it still works offline for demos。