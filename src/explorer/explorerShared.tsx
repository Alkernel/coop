import React, { useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Zap, CheckCircle2, Gift, Coins,
  Copy, Check, ExternalLink
} from 'lucide-react';
import { CoinIcon } from '../components/CoinIcon';
import { assetFromCurrency } from '../utils/assets';
import {
  ExplorerTransaction, isCompletedStatus, isFailedStatus, isPendingStatus
} from '../services/supabase';
import { explorerTxPath } from './route';
import { useExplorerNav } from './nav';

// ---------------------------------------------------------------------------
// Formatting helpers (explorer only — wallet screens keep their own wording)
// ---------------------------------------------------------------------------

export const formatAmount = (n: number, maxDecimals = 4): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals });

export const formatDateTime = (ts: number): string => {
  if (!Number.isFinite(ts)) return '—';
  return `${new Date(ts).toISOString().replace('T', ' ').slice(0, 19)} UTC`;
};

export const shorten = (value?: string | null, head = 12, tail = 8): string => {
  if (!value) return '—';
  const v = String(value);
  if (v.length <= head + tail + 3) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
};

export const explorerTxTypeLabel = (txType: string): string => {
  switch (txType) {
    case 'send': return 'COOP Sent';
    case 'receive': return 'COOP Received';
    case 'swap': return 'Swap';
    case 'mining': return 'Mining Reward';
    case 'boost': return 'Boost Purchase';
    case 'task': return 'Task Reward';
    case 'admin': return 'Coop Reward';
    default: return txType;
  }
};

export const isIncomingTx = (tx: ExplorerTransaction): boolean =>
  tx.txType === 'receive' || tx.txType === 'mining' || tx.txType === 'task' ||
  tx.txType === 'boost' || (tx.txType === 'admin' && tx.amount >= 0);

export const statusTone = (status: string): 'green' | 'amber' | 'red' | 'gray' => {
  if (isCompletedStatus(status)) return 'green';
  if (isPendingStatus(status)) return 'amber';
  if (isFailedStatus(status)) return 'red';
  return 'gray';
};

export const statusLabel = (status: string): string => {
  if (isCompletedStatus(status)) return 'Completed';
  if (isPendingStatus(status)) return 'Pending';
  if (isFailedStatus(status)) return 'Failed';
  return status || 'Unknown';
};

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

export const StatusPill: React.FC<{ status: string }> = ({ status }) => (
  <span className={`explorer-pill ${statusTone(status)}`}>{statusLabel(status)}</span>
);

export const AssetChip: React.FC<{ currency?: string | null; size?: number; showName?: boolean }> = ({
  currency, size = 18, showName = true
}) => {
  const asset = assetFromCurrency(currency);
  return (
    <span className="explorer-asset-chip">
      <CoinIcon coin={asset.coin} size={size} />
      {showName && <span>{asset.symbol}</span>}
    </span>
  );
};

export const CopyButton: React.FC<{
  value: string;
  label?: string;
}> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`explorer-copy ${copied ? 'copied' : ''}`}
      title={copied ? 'Copied' : 'Copy'}
    >
      {label ?? value}
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
};

const txIcon = (txType: string) => {
  switch (txType) {
    case 'receive': return <ArrowDownLeft size={15} />;
    case 'send': return <ArrowUpRight size={15} />;
    case 'swap': return <ArrowLeftRight size={15} />;
    case 'mining': return <Zap size={15} />;
    case 'task': return <CheckCircle2 size={15} />;
    case 'boost': return <Zap size={15} />;
    case 'admin': return <Gift size={15} />;
    default: return <Coins size={15} />;
  }
};

/**
 * One ledger transaction. Rendered as a real link to /explorer/tx/{hash} so it
 * can be copied, bookmarked or opened in a new tab, while normal clicks stay
 * inside the SPA.
 */
export const TxRow: React.FC<{ tx: ExplorerTransaction }> = ({ tx }) => {
  const { navigate } = useExplorerNav();
  const incoming = isIncomingTx(tx);
  const href = explorerTxPath(tx.txHash);
  const isSwap = tx.txType === 'swap';
  const amount = isSwap && tx.pointsAmount > 0 ? tx.pointsAmount : tx.amount;
  const unit = isSwap && tx.pointsAmount > 0 ? 'Coopoint' : assetFromCurrency(tx.currency).symbol;

  return (
    <a
      className="explorer-row"
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      <div className="explorer-row-main">
        <span className="explorer-row-icon">{txIcon(tx.txType)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="explorer-row-title">{explorerTxTypeLabel(tx.txType)}</div>
          <div className="explorer-row-sub explorer-mono">{shorten(tx.txHash, 14, 8)}</div>
        </div>
      </div>

      <div className="explorer-row-mid">
        <div className="explorer-mono" style={{ color: 'var(--text-secondary)' }}>
          {shorten(tx.counterparty, 16, 8)}
        </div>
        <div className="explorer-row-sub">{formatDateTime(tx.timestamp)}</div>
      </div>

      <div className="explorer-row-right">
        <div className="explorer-row-amount" style={{ color: incoming ? 'var(--accent-green)' : undefined }}>
          {incoming ? '+' : '−'}{formatAmount(amount)}
          <span className="sym">{unit}</span>
        </div>
        <StatusPill status={tx.status} />
      </div>
    </a>
  );
};

export const ExplorerLoading: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="explorer-rows" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="explorer-shimmer" />
    ))}
  </div>
);

export const WalletLink: React.FC<{ address?: string | null }> = ({ address }) => {
  const { navigate } = useExplorerNav();
  if (!address) return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
  const href = `/explorer/address/${encodeURIComponent(address)}`;
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
      className="explorer-mono"
      style={{ color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: 5 }}
    >
      {shorten(address, 14, 8)}
      <ExternalLink size={11} />
    </a>
  );
};

