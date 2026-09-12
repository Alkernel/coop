import React, { useState } from 'react';
import { ChevronLeft, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Zap, CheckCircle2 } from 'lucide-react';
import { useWallet } from '../context/WalletContext';

export const HistoryScreen: React.FC = () => {
  const { goBack, transactions } = useWallet();
  const [filter, setFilter] = useState<'all' | 'send' | 'receive' | 'swap'>('all');

  const filtered = transactions.filter(t => {
    if (filter === 'all') return true;
    return t.txType === filter;
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="history-back-btn">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Transaction History</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        margin: '12px 0 20px 0',
        overflowX: 'auto',
        paddingBottom: 4
      }}>
        {(['all', 'send', 'receive', 'swap'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: '6px 16px',
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'capitalize',
              background: filter === tab ? 'var(--btn-primary-bg)' : 'var(--bg-glass)',
              color: filter === tab ? 'var(--btn-primary-text)' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            }}
            id={`filter-${tab}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Transactions List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px 0', fontSize: 14 }}>
            No transactions found
          </div>
        ) : (
          filtered.map(tx => {
            const isIncoming = tx.txType === 'receive' || tx.txType === 'mining' || tx.txType === 'task' || tx.txType === 'boost';
            const isSwap = tx.txType === 'swap';
            const pointsToCoop = tx.direction !== 'coop_to_points';
            const isAdminCredit = tx.txType === 'admin' && tx.amount >= 0;
            // Legacy rows use 'Complete'; new rows use 'Completed'. Both mean done.
            const statusLabel = tx.status === 'Complete' ? 'Completed' : tx.status;
            return (
              <div
                key={tx.id}
                className="bubble-card"
                style={{
                  padding: '14px 16px',
                  marginBottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'var(--bg-glass-active)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isSwap || isIncoming ? 'var(--accent-green)' : 'var(--text-primary)'
                  }}>
                    {tx.txType === 'receive' && <ArrowDownLeft size={18} />}
                    {tx.txType === 'send' && <ArrowUpRight size={18} />}
                    {tx.txType === 'swap' && <ArrowLeftRight size={18} />}
                    {tx.txType === 'mining' && <Zap size={18} />}
                    {tx.txType === 'task' && <CheckCircle2 size={18} />}
                    {tx.txType === 'boost' && <Zap size={18} />}
                    {tx.txType === 'admin' && <CheckCircle2 size={18} />}
                  </div>

                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize' }}>
                      {isSwap ? 'Swap' : tx.txType === 'send' ? 'COOP Sent' : tx.txType === 'receive' ? 'COOP Received' : tx.txType}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDate(tx.timestamp)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      ID: {tx.txHash.slice(0, 14)}…
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  {isSwap && tx.pointsAmount != null ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        -{tx.pointsAmount.toLocaleString()} Cooptoken
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-green)' }}>
                        +{tx.amount.toLocaleString()} COOP
                      </div>
                    </>
                  ) : (
                    <div style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: isIncoming || isAdminCredit ? 'var(--accent-green)' : 'var(--text-primary)'
                    }}>
                      {isIncoming || isAdminCredit ? '+' : '-'}{tx.amount.toFixed(2)} {tx.currency === 'COOP' ? 'COOP' : tx.currency === 'Coopoints' ? 'Cooptoken' : tx.currency}
                    </div>
                  )}
                  <div style={{
                    fontSize: 11,
                    color: statusLabel === 'Completed' ? 'var(--accent-green)' : 'var(--text-tertiary)',
                    fontWeight: 500
                  }}>
                    {statusLabel}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
