import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, RefreshCw, Wallet } from 'lucide-react';
import { dbService, ExplorerAddressActivity } from '../services/supabase';
import {
  CopyButton, ExplorerLoading, TxRow, formatAmount
} from './explorerShared';
import { EXPLORER_HOME } from './route';
import { useExplorerNav } from './nav';

export const ExplorerAddressPage: React.FC<{ address: string }> = ({ address }) => {
  const { navigate } = useExplorerNav();
  const [data, setData] = useState<ExplorerAddressActivity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    dbService.explorerAddressActivity(address, { limit: 60 })
      .then(res => { if (alive) { setData(res); setError(''); } })
      .catch((e: any) => { if (alive) setError(e?.message || 'Could not load this wallet'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [address, reloadKey]);

  const rows = data?.rows || [];

  // Real totals derived from the ledger rows themselves (incoming = rows that
  // credit this address, outgoing = rows that debit it).
  const totals = useMemo(() => {
    let incoming = 0, outgoing = 0, incomingCount = 0, outgoingCount = 0;
    rows.forEach(r => {
      const credited = r.txType === 'receive' || r.txType === 'mining' || r.txType === 'task' ||
        r.txType === 'boost' || (r.txType === 'admin' && r.amount >= 0);
      if (credited) { incoming += r.amount; incomingCount += 1; }
      else { outgoing += r.amount; outgoingCount += 1; }
    });
    return { incoming, outgoing, incomingCount, outgoingCount };
  }, [rows]);

  return (
    <div style={{ paddingBottom: 10 }}>
      <div className="explorer-section-title" style={{ marginTop: 18 }}>
        <h2>Wallet</h2>
        <button type="button" className="explorer-btn" onClick={() => navigate(EXPLORER_HOME)}>
          <ChevronLeft size={13} /> Explorer
        </button>
      </div>

      <div className="explorer-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span className="explorer-row-icon" style={{ width: 40, height: 40 }}>
            <Wallet size={17} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Coop wallet address
            </div>
            <CopyButton value={address} label={address} />
          </div>
        </div>

        <div className="explorer-kv">
          <span className="k">Ledger records involving this address</span>
          <span className="v">{rows.length}{data?.total != null ? ` of ${data.total}` : ''}</span>
        </div>
        <div className="explorer-kv">
          <span className="k">Received</span>
          <span className="v" style={{ color: 'var(--accent-green)' }}>
            +{formatAmount(totals.incoming)} <span style={{ fontSize: 11 }}>({totals.incomingCount} records)</span>
          </span>
        </div>
        <div className="explorer-kv">
          <span className="k">Sent</span>
          <span className="v">−{formatAmount(totals.outgoing)} <span style={{ fontSize: 11 }}>({totals.outgoingCount} records)</span></span>
        </div>
        {!loading && data && !data.indexed && (
          <div className="explorer-hint" style={{ marginTop: 8 }}>
            This deployment has no address index yet, so the list below shows the
            transfer records where this address is the counterparty (both sides of
            each transfer). Rewards that never name a counterparty cannot be
            attached to an address until indexing is enabled.
          </div>
        )}
      </div>

      {error && <div className="explorer-error">{error}</div>}

      {loading ? (
        <ExplorerLoading rows={4} />
      ) : rows.length === 0 ? (
        <div className="explorer-card">
          <div className="explorer-empty">
            No ledger records found for this address yet.
            <div className="explorer-hint" style={{ marginTop: 8 }}>{address}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="explorer-section-title">
            <h2>Transactions</h2>
            <button type="button" className="explorer-btn" onClick={() => setReloadKey(k => k + 1)}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          <div className="explorer-rows">
            {rows.map(tx => <TxRow key={tx.id} tx={tx} />)}
          </div>
        </>
      )}
    </div>
  );
};
