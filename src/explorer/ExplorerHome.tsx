import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Layers, CircleSlash } from 'lucide-react';
import {
  dbService, CoopMarket, ExplorerActivity, ExplorerHolders, ExplorerStats,
  ExplorerTransaction, ExplorerStatusFilter
} from '../services/supabase';
import { ExplorerLoading, TxRow, WalletLink, formatAmount, formatDateTime } from './explorerShared';

// The explorer indexes ON-LEDGER COOP COIN TRANSFERS only. Coopoint is an
// off-chain points balance stored in the database, so it is never a filter here.
const TYPES = ['all', 'send', 'receive'] as const;

const STATUSES: { id: ExplorerStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Failed' }
];

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'capitalize',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: '1px solid var(--border-color)',
  background: active ? 'var(--btn-primary-bg)' : 'var(--bg-glass)',
  color: active ? 'var(--btn-primary-text)' : 'var(--text-secondary)'
});

export const ExplorerHome: React.FC<{ query: string }> = ({ query }) => {
  const [stats, setStats] = useState<ExplorerStats | null>(null);
  const [rows, setRows] = useState<ExplorerTransaction[]>([]);
  const [market, setMarket] = useState<CoopMarket | null>(null);
  const [holders, setHolders] = useState<ExplorerHolders | null>(null);
  const [activity, setActivity] = useState<ExplorerActivity | null>(null);
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<ExplorerStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    try {
      // holders / activity / market always resolve (they fall back to the
      // ledger or report `indexed: false`), so Promise.all stays safe here.
      const [nextStats, nextRows, nextMarket, nextHolders, nextActivity] = await Promise.all([
        dbService.explorerStats(),
        dbService.explorerRecent({ limit: 25, type, status }),
        dbService.coopMarket(),
        dbService.explorerHolders(20),
        dbService.explorerActivity(14)
      ]);
      setStats(nextStats);
      setRows(nextRows);
      setMarket(nextMarket);
      setHolders(nextHolders);
      setActivity(nextActivity);
      setError('');
      setUpdatedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || 'Could not load the Coop ledger');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [type, status]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live ledger feel: quietly refresh the overview while the tab stays open.
  useEffect(() => {
    const id = window.setInterval(() => load(true), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const stat = (label: string, value: string | number, tone?: 'green' | 'amber' | 'red') => (
    <div className={`explorer-stat ${tone || ''}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );

  // Bar scale for the 14-day activity chart so the busiest day always fills it.
  const activityMax = Math.max(1, ...(activity?.days ?? []).map(d => Math.max(d.sent, d.received)));

  return (
    <div>
      {query && (
        <div className="explorer-card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CircleSlash size={16} color="var(--accent-red)" />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>No transaction or wallet found</div>
              <div className="explorer-hint" style={{ marginTop: 2 }}>
                Nothing in the Coop ledger matches “{query}”. Check the hash or address.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="explorer-stat-grid" style={{ marginTop: 18 }}>
        {stat('COOP transfers', stats ? stats.total.toLocaleString() : '—')}
        {stat('Completed', stats ? stats.completed.toLocaleString() : '—', 'green')}
        {stat('Pending', stats ? stats.pending.toLocaleString() : '—', 'amber')}
        {stat('Failed', stats ? stats.failed.toLocaleString() : '—', 'red')}
      </div>

      {/* ---- Coopcoin market: admin reference price + real supply/holders ---- */}
      <div className="explorer-card">
        <div className="explorer-card-title">Coopcoin (COOP) market</div>
        <div className="explorer-kv">
          <span className="k">Reference price</span>
          <span className="v">
            {market?.priceSet
              ? `$${market.coopPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT`
              : 'Not published by an admin yet'}
          </span>
        </div>
        <div className="explorer-kv">
          <span className="k">Circulating supply</span>
          <span className="v">
            {market && market.indexed ? `${formatAmount(market.circulatingSupply)} COOP` : '—'}
          </span>
        </div>
        <div className="explorer-kv">
          <span className="k">Circulating market value</span>
          <span className="v">
            {market?.priceSet && market.indexed
              ? `$${(market.circulatingSupply * market.coopPriceUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
              : '—'}
          </span>
        </div>
        <div className="explorer-kv">
          <span className="k">Holders</span>
          <span className="v">{market && market.indexed ? market.holderCount.toLocaleString() : '—'}</span>
        </div>
        <div className="explorer-kv">
          <span className="k">Coopoint value</span>
          <span className="v">
            {market && market.pointsPerCoop > 0
              ? `${market.pointsPerCoop.toLocaleString('en-US')} Coopoint = 1 COOP`
              : 'Swap ratio unavailable'}
          </span>
        </div>
        <div className="explorer-kv">
          <span className="k">Reward pool remaining</span>
          <span className="v">{market && market.indexed ? `${formatAmount(market.poolRemaining)} COOP` : '—'}</span>
        </div>
        {market != null && !market.indexed && (
          <div className="explorer-hint" style={{ marginTop: 8 }}>
            Market index is not deployed yet — apply supabase/migration-v10-explorer.sql to publish
            live supply, holder and price data.
          </div>
        )}
      </div>

      {/* ---- Top holders: real COOP balances + share of supply ---- */}
      <div className="explorer-card">
        <div className="explorer-card-title">Top COOP holders</div>
        {holders && holders.holders.length > 0 ? (
          <div className="explorer-holders">
            <div className="explorer-holder-row head">
              <span>#</span><span>Address</span><span>Balance</span><span>Share</span>
            </div>
            {holders.holders.map(h => (
              <div className="explorer-holder-row" key={h.address}>
                <span className="rank">{h.rank}</span>
                <WalletLink address={h.address} />
                <span className="bal">{formatAmount(h.balance)}</span>
                <span className="share">{h.sharePct < 0.01 ? '<0.01' : h.sharePct.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="explorer-empty">
            {holders?.indexed ? 'No COOP holders yet.' : 'Holder index is not deployed yet.'}
          </div>
        )}
        {holders && holders.holders.length > 0 && (
          <div className="explorer-hint" style={{ marginTop: 8 }}>
            {holders.holderCount.toLocaleString()} holder{holders.holderCount === 1 ? '' : 's'} ·
            total held {formatAmount(holders.totalSupply)} COOP
          </div>
        )}
      </div>

      {/* ---- Activity: real 14-day COOP flow (always derived from rows) ---- */}
      <div className="explorer-card">
        <div className="explorer-card-title">Activity · last 14 days</div>
        {activity && activity.days.length > 0 ? (
          <>
            <div className="explorer-kv">
              <span className="k">COOP sent</span>
              <span className="v">{formatAmount(activity.totalSent)} COOP</span>
            </div>
            <div className="explorer-kv">
              <span className="k">COOP received</span>
              <span className="v">{formatAmount(activity.totalReceived)} COOP</span>
            </div>
            <div className="explorer-kv">
              <span className="k">Active wallets</span>
              <span className="v">{activity.uniqueWallets.toLocaleString()}</span>
            </div>
            <div className="explorer-activity">
              {activity.days.map(d => (
                <div className="explorer-activity-day" key={d.date}>
                  <div className="bars">
                    <span className="bar out" style={{ height: `${Math.max(3, (d.sent / activityMax) * 100)}%` }} />
                    <span className="bar in" style={{ height: `${Math.max(3, (d.received / activityMax) * 100)}%` }} />
                  </div>
                  <span className="label">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="explorer-hint" style={{ marginTop: 8 }}>
              Outgoing and incoming COOP volume per day, straight from the ledger rows.
            </div>
          </>
        ) : (
          <div className="explorer-empty">No COOP transfer activity in this window yet.</div>
        )}
      </div>

      <div className="explorer-card">
        <div className="explorer-card-title">Network</div>
        <div className="explorer-kv">
          <span className="k">Ledger</span>
          <span className="v">COOP internal ledger (Supabase-backed, server-authoritative)</span>
        </div>
        <div className="explorer-kv">
          <span className="k">Indexed asset</span>
          <span className="v">
            Coopcoin (COOP) transfers only — Coopoint is an off-chain points
            balance, not a ledger transfer
          </span>
        </div>
        <div className="explorer-kv">
          <span className="k">Network fee</span>
          <span className="v">Internal transfers settle with 0 fee</span>
        </div>
        <div className="explorer-kv">
          <span className="k">Indexed wallets</span>
          <span className="v">{stats?.wallets != null ? stats.wallets.toLocaleString() : 'Not indexed yet'}</span>
        </div>
        <div className="explorer-kv">
          <span className="k">Blocks</span>
          <span className="v">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Layers size={13} color="var(--text-tertiary)" />
              No block data — the Coop ledger is not block-based yet
            </span>
          </span>
        </div>
        {stats?.firstTimestamp != null && (
          <div className="explorer-kv">
            <span className="k">Indexed from</span>
            <span className="v">{formatDateTime(stats.firstTimestamp)}</span>
          </div>
        )}
      </div>

      <div className="explorer-section-title">
        <h2>Recent COOP transfers</h2>
        <button
          type="button"
          className="explorer-btn"
          onClick={() => load(true)}
          disabled={refreshing}
        >
          <RefreshCw size={13} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
        {TYPES.map(t => (
          <button key={t} type="button" style={chipStyle(type === t)} onClick={() => setType(t)}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
        {STATUSES.map(s => (
          <button key={s.id} type="button" style={chipStyle(status === s.id)} onClick={() => setStatus(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {error && <div className="explorer-error">{error}</div>}

      {loading ? (
        <ExplorerLoading rows={5} />
      ) : rows.length === 0 ? (
        <div className="explorer-card">
          <div className="explorer-empty">No COOP transfers match these filters yet.</div>
        </div>
      ) : (
        <div className="explorer-rows">
          {rows.map(tx => <TxRow key={tx.id} tx={tx} />)}
        </div>
      )}

      <div className="explorer-hint" style={{ marginTop: 12 }}>
        Showing the latest {rows.length} matching COOP transfer{rows.length === 1 ? '' : 's'}
        {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleTimeString('en-US')}` : ''}
      </div>
    </div>
  );
};
