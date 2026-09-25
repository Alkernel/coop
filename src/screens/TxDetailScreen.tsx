import React, { useState } from 'react';
import { ChevronLeft, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Zap, CheckCircle2, Copy, Check, ExternalLink } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { assetFromCurrency } from '../utils/assets';
import { explorerTxPath } from '../explorer/route';

export const TxDetailScreen: React.FC = () => {
  const { goBack, selectedTx, account } = useWallet();
  const [copied, setCopied] = useState<string | null>(null);

  if (!selectedTx) {
    return (
      <div className="screen-content" style={{ paddingBottom: 16 }}>
        <div className="screen-header">
          <button className="header-icon-btn" onClick={goBack} aria-label="Back">
            <ChevronLeft size={22} />
          </button>
          <span className="screen-header-title">Transaction</span>
          <div style={{ width: 40 }} />
        </div>
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px 0', fontSize: 14 }}>
          Transaction not found
        </div>
      </div>
    );
  }

  const tx = selectedTx;
  const isSwap = tx.txType === 'swap';
  const isIncoming = tx.txType === 'receive' || tx.txType === 'mining' || tx.txType === 'task' || tx.txType === 'boost' || (tx.txType === 'admin' && tx.amount >= 0);
  const isAdmin = tx.txType === 'admin';
  const statusLabel = tx.status === 'Complete' ? 'Completed' : tx.status;
  const asset = assetFromCurrency(tx.currency);

  const title =
    isSwap ? (tx.direction === 'coop_to_points' ? 'Swap COOP → Coopoint' : 'Swap Coopoint → COOP')
    : tx.txType === 'send' ? 'COOP Sent'
    : tx.txType === 'receive' ? 'COOP Received'
    : isAdmin ? 'Coop Rewards'
    : tx.txType === 'mining' ? 'Mining Reward'
    : tx.txType === 'task' ? 'Task Reward'
    : tx.txType === 'boost' ? 'Boost Purchase'
    : 'Transaction';

  const directionLabel = isIncoming ? (isAdmin ? 'Rewarded to you' : 'Received') : 'Sent';

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const fullDate = new Date(tx.timestamp).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12, padding: '13px 0', borderBottom: '1px solid var(--border-color)'
  };
  const kStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 };
  const vStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' };

  const counterpartyLabel = tx.txType === 'send' ? 'Sent to' : tx.txType === 'receive' ? 'From' : isAdmin ? 'Source' : null;

  return (
    <div className="screen-content" style={{ paddingBottom: 24 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">{title}</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Amount hero */}
      <div style={{ textAlign: 'center', padding: '26px 0 22px 0' }}>
        <div style={{
          width: 62, height: 62, borderRadius: '50%', margin: '0 auto 14px auto',
          background: 'var(--bg-glass-active)', border: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isIncoming || isSwap ? 'var(--accent-green)' : 'var(--text-primary)'
        }}>
          {tx.txType === 'receive' && <ArrowDownLeft size={26} />}
          {tx.txType === 'send' && <ArrowUpRight size={26} />}
          {isSwap && <ArrowLeftRight size={26} />}
          {(tx.txType === 'mining' || tx.txType === 'boost') && <Zap size={26} />}
          {(tx.txType === 'task' || isAdmin) && <CheckCircle2 size={26} />}
        </div>
        {isSwap && tx.pointsAmount != null ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              −{tx.pointsAmount.toLocaleString()} Coopoint
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent-green)', letterSpacing: '-0.5px' }}>
              +{tx.amount.toLocaleString()} COOP
            </div>
          </>
        ) : (
          <div style={{
            fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px',
            color: isIncoming ? 'var(--accent-green)' : 'var(--text-primary)'
          }}>
            {isIncoming ? '+' : '−'}{(tx.amount || tx.pointsAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
            {asset.symbol}
          </div>
        )}
        <div style={{
          display: 'inline-block', marginTop: 12, padding: '5px 14px', borderRadius: 9999,
          fontSize: 12, fontWeight: 700,
          background: statusLabel === 'Completed' ? 'rgba(46, 204, 113, 0.12)' : 'var(--bg-glass)',
          color: statusLabel === 'Completed' ? 'var(--accent-green)' : 'var(--text-secondary)',
          border: '1px solid var(--border-color)'
        }}>
          {statusLabel}
        </div>
      </div>
      {/* Details */}
      <div className="bubble-card" style={{ padding: '4px 18px' }}>
        {counterpartyLabel && tx.counterparty && (
          <div style={rowStyle}>
            <span style={kStyle}>{counterpartyLabel}</span>
            <button
              type="button"
              onClick={() => copy(tx.counterparty!, 'counterparty')}
              style={{ ...vStyle, fontFamily: 'var(--font-mono)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'right' }}
            >
              {tx.counterparty}
              {copied === 'counterparty' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        )}
        {isSwap && (
          <div style={rowStyle}>
            <span style={kStyle}>Direction</span>
            <span style={vStyle}>{tx.direction === 'coop_to_points' ? 'COOP → Coopoint' : 'Coopoint → COOP'}</span>
          </div>
        )}
        {isSwap && tx.counterparty && (
          <div style={rowStyle}>
            <span style={kStyle}>Counterparty</span>
            <span style={vStyle}>{tx.counterparty}</span>
          </div>
        )}
        {tx.memo && (
          <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <span style={kStyle}>{isIncoming && !isSwap ? 'Sender comment' : 'Comment'}</span>
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, wordBreak: 'break-word' }}>
              {tx.memo}
            </span>
          </div>
        )}
        {tx.notes && !tx.memo && (
          <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <span style={kStyle}>Details</span>
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, wordBreak: 'break-word' }}>
              {tx.notes}
            </span>
          </div>
        )}
        <div style={rowStyle}>
          <span style={kStyle}>Date</span>
          <span style={{ ...vStyle, fontSize: 12 }}>{fullDate}</span>
        </div>
        {tx.fee != null && (
          <div style={rowStyle}>
            <span style={kStyle}>Network fee</span>
            <span style={vStyle}>{tx.fee === 0 ? 'Free (internal)' : tx.fee}</span>
          </div>
        )}
        <div style={rowStyle}>
          <span style={kStyle}>Network</span>
          <span style={vStyle}>{asset.network}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={kStyle}>Transaction hash</span>
          <button
            onClick={() => copy(tx.txHash, 'tx')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: copied === 'tx' ? 'var(--accent-green)' : 'var(--text-secondary)',
              wordBreak: 'break-all', textAlign: 'right'
            }}
          >
            {tx.txHash}
            {copied === 'tx' ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
        <a
          href={explorerTxPath(tx.txHash)}
          target="_blank"
          rel="noreferrer"
          className="pill-btn pill-btn-primary"
          style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}
        >
          <ExternalLink size={15} /> View on Coop Explorer
        </a>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16, padding: '0 12px' }}>
        COOP internal ledger reference
      </p>
    </div>
  );
};