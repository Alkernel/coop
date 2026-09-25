import React, { useEffect, useState } from 'react';
import { ChevronLeft, RefreshCw, Layers } from 'lucide-react';
import { dbService, ExplorerTransaction } from '../services/supabase';
import { assetFromCurrency } from '../utils/assets';
import {
  AssetChip, CopyButton, ExplorerLoading, StatusPill, WalletLink,
  explorerTxTypeLabel, formatAmount, formatDateTime, isIncomingTx, shorten, statusLabel
} from './explorerShared';
import { EXPLORER_HOME } from './route';
import { useExplorerNav } from './nav';

const kv = (label: string, value: React.ReactNode) => (
  <div className="explorer-kv">
    <span className="k">{label}</span>
    <span className="v">{value}</span>
  </div>
);

export const ExplorerTxPage: React.FC<{ hash: string }> = ({ hash }) => {
  const { navigate } = useExplorerNav();
  const [legs, setLegs] = useState<ExplorerTransaction[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    dbService.explorerTxLegs(hash)
      .then(rows => { if (alive) { setLegs(rows); setError(''); } })
      .catch((e: any) => { if (alive) setError(e?.message || 'Could not load this transaction'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [hash, reloadKey]);

  if (loading) {
    return (
      <div style={{ marginTop: 18 }}>
        <ExplorerLoading rows={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ marginTop: 18 }}>
        <div className="explorer-error">{error}</div>
        <button type="button" className="explorer-btn" onClick={() => setReloadKey(k => k + 1)}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const rows = legs || [];
  if (!rows.length) {
    return (
      <div className="explorer-card" style={{ marginTop: 18 }}>
        <div className="explorer-empty">
          No ledger record exists for this transaction hash.
          <div className="explorer-hint" style={{ marginTop: 8 }}>{hash}</div>
          <button
            type="button"
            className="explorer-btn"
            style={{ marginTop: 14 }}
            onClick={() => navigate(EXPLORER_HOME)}
          >
            <ChevronLeft size={13} /> Back to explorer
          </button>
        </div>
      </div>
    );
  }

  const sendLeg = rows.find(r => r.txType === 'send');
  const receiveLeg = rows.find(r => r.txType === 'receive');
  const swapLeg = rows.find(r => r.txType === 'swap');
  const primary = rows[0];
  const tx = sendLeg || swapLeg || primary;

  const isTransfer = Boolean(sendLeg || receiveLeg);
  const from = receiveLeg ? receiveLeg.counterparty : (isTransfer ? tx.walletAddress : tx.counterparty);
  const to = sendLeg ? sendLeg.counterparty : (isTransfer ? tx.walletAddress : (tx.walletAddress || 'COOP treasury'));

  const incoming = isIncomingTx(primary);
  const isSwap = primary.txType === 'swap';
  const amount = isSwap && primary.pointsAmount > 0 ? primary.pointsAmount : primary.amount;
  const unit = isSwap && primary.pointsAmount > 0 ? 'Coopoint' : assetFromCurrency(primary.currency).symbol;

  return (
    <div style={{ paddingBottom: 10 }}>
      <div className="explorer-section-title" style={{ marginTop: 18 }}>
        <h2>Transaction</h2>
        <button type="button" className="explorer-btn" onClick={() => navigate(EXPLORER_HOME)}>
          <ChevronLeft size={13} /> Explorer
        </button>
      </div>

      <div className="explorer-card">
        <div className="explorer-hero">
          <AssetChip currency={primary.currency} size={38} showName={false} />
          <div className="explorer-hero-amount" style={{ color: incoming ? 'var(--accent-green)' : undefined }}>
            {incoming ? '+' : '−'}{formatAmount(amount)}
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginLeft: 6 }}>{unit}</span>
          </div>
          <StatusPill status={primary.status} />
          <div className="explorer-hint" style={{ marginTop: 10 }}>
            {explorerTxTypeLabel(primary.txType)} · {formatDateTime(primary.timestamp)}
          </div>
        </div>
      </div>

      <div className="explorer-card">
        <div className="explorer-card-title">Details</div>
        {kv('Status', <StatusPill status={primary.status} />)}
        {kv('Type', explorerTxTypeLabel(primary.txType))}
        {kv('Asset', <AssetChip currency={primary.currency} />)}
        {kv('Amount', `${formatAmount(primary.amount, 4)} ${assetFromCurrency(primary.currency).symbol}`)}
        {primary.pointsAmount > 0 && kv('Coopoint leg', `${formatAmount(primary.pointsAmount, 2)} Coopoint`)}
        {primary.direction && kv('Direction', primary.direction === 'coop_to_points' ? 'COOP → Coopoint' : 'Coopoint → COOP')}
        {kv('From', from
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CopyButton value={from} label={shorten(from, 12, 8)} />
              <WalletLink address={from} />
            </span>
          : '—')}
        {kv('To', to
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CopyButton value={to} label={shorten(to, 12, 8)} />
              {to.startsWith('0x') && <WalletLink address={to} />}
            </span>
          : '—')}
        {kv('Network fee', primary.fee === 0 ? '0 — internal COOP transfer' : `${formatAmount(primary.fee, 4)}`)}
        {kv('Network', 'COOP internal ledger')}
        {kv('Block', (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <Layers size={13} /> Not available (ledger has no block data yet)
          </span>
        ))}
        {kv('Confirmations', primary.status === 'Completed' || primary.status === 'Complete'
          ? `Recorded in ${rows.length} ledger ${rows.length === 1 ? 'entry' : 'entries'} (atomic server write)`
          : statusLabel(primary.status))}
        {kv('Timestamp', formatDateTime(primary.timestamp))}
        {kv('Transaction hash', <CopyButton value={primary.txHash} label={primary.txHash} />)}
        {primary.memo && kv('Memo', primary.memo)}
        {primary.notes && !primary.memo && kv('Ledger notes', primary.notes)}
      </div>

      {rows.length > 1 && (
        <div className="explorer-card">
          <div className="explorer-card-title">Ledger entries ({rows.length})</div>
          <div className="explorer-rows">
            {rows.map(leg => (
              <div key={leg.id} className="explorer-row" style={{ cursor: 'default' }}>
                <div className="explorer-row-main">
                  <span className="explorer-row-icon">
                    {leg.txType === 'send' ? '↑' : leg.txType === 'receive' ? '↓' : '•'}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="explorer-row-title">{explorerTxTypeLabel(leg.txType)}</div>
                    <div className="explorer-row-sub explorer-mono">
                      account: {leg.walletAddress || 'account address not indexed yet'}
                    </div>
                  </div>
                </div>
                <div className="explorer-row-mid">
                  <div className="explorer-mono" style={{ color: 'var(--text-secondary)' }}>
                    counterparty: {shorten(leg.counterparty, 14, 6)}
                  </div>
                  <div className="explorer-row-sub">{formatDateTime(leg.timestamp)}</div>
                </div>
                <div className="explorer-row-right">
                  <div className="explorer-row-amount">
                    {formatAmount(isSwap && leg.pointsAmount > 0 ? leg.pointsAmount : leg.amount)}
                    <span className="sym">
                      {isSwap && leg.pointsAmount > 0 ? 'Coopoint' : assetFromCurrency(leg.currency).symbol}
                    </span>
                  </div>
                  <StatusPill status={leg.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
