import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Layers, CircleSlash } from 'lucide-react';
import { dbService, ExplorerStats, ExplorerTransaction, ExplorerStatusFilter } from '../services/supabase';
import { ExplorerLoading, TxRow, formatDateTime } from './explorerShared';

const TYPES = ['all', 'send', 'receive', 'swap', 'mining', 'boost', 'task', 'admin'] as const;

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
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<ExplorerStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    try {
      const [nextStats, nextRows] = await Promise.all([
        dbService.explorerStats(),
        dbService.explorerRecent({ limit: 25, type, status })
      ]);
      setStats(nextStats);
      setRows(nextRows);
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
        {stat('Ledger records', stats ? stats.total.toLocaleString() : '—')}
        {stat('Completed', stats ? stats.completed.toLocaleString() : '—', 'green')}
        {stat('Pending', stats ? stats.pending.toLocaleString() : '—', 'amber')}
        {stat('Failed', stats ? stats.failed.toLocaleString() : '—', 'red')}
      </div>

      <div className="explorer-card">
        <div className="explorer-card-title">Network</div>
        <div className="explorer-kv">
          <span className="k">Ledger</span>
          <span className="v">COOP internal ledger (Supabase-backed, server-authoritative)</span>
        </div>
        <div className="explorer-kv">
          <span className="k">Assets</span>
          <span className="v">Coopcoin (COOP) · Coopoint · USDT (BEP-20)</span>
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
        <h2>Recent transactions</h2>
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
          <div className="explorer-empty">No ledger records match these filters yet.</div>
        </div>
      ) : (
        <div className="explorer-rows">
          {rows.map(tx => <TxRow key={tx.id} tx={tx} />)}
        </div>
      )}

      <div className="explorer-hint" style={{ marginTop: 12 }}>
        Showing the latest {rows.length} matching ledger record{rows.length === 1 ? '' : 's'}
        {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleTimeString('en-US')}` : ''}
      </div>
    </div>
  );
};
