import React, { useState } from 'react';
import { ChevronLeft, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, History, Copy, Check } from 'lucide-react';
import { CoinIcon } from '../components/CoinIcon';
import { useWallet } from '../context/WalletContext';
import { Transaction } from '../types';

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const AssetScreen: React.FC = () => {
  const { goBack, account, selectedAsset, transactions, navigateTo } = useWallet();
  const [copied, setCopied] = useState(false);

  const isCOOP = selectedAsset === 'COOP';
  const balance = isCOOP ? (account?.coopBalance || 0) : (account?.cooptokenBalance || 0);
  const name = isCOOP ? 'Coopcoin' : 'Coopoint';
  const symbol = isCOOP ? 'COOP' : 'Coopoint';
  const coin = isCOOP ? 'COOP' as const : 'COOPTOKEN' as const;

  const assetTxs = transactions.filter(t =>
    isCOOP ? (t.currency === 'COOP') : (t.currency === 'Coopoints' || t.pointsAmount != null)
  );

  const handleCopy = () => {
    if (!account?.address) return;
    navigator.clipboard.writeText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">{name}</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Balance Card */}
      <div className="bubble-card bubble-card-elevated" style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <CoinIcon coin={coin} size={56} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>
          {name} Balance
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.5px' }}>
          {fmt(balance)} {symbol}
        </div>
      </div>

      {/* Address */}
      <div className="bubble-card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>Wallet Address</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>
              {account?.address || '—'}
            </div>
          </div>
          <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {isCOOP && (
          <>
            <button className="pill-btn pill-btn-primary" onClick={() => navigateTo('send')} style={{ flex: 1 }}>
              <ArrowUpRight size={16} /> Send
            </button>
            <button className="pill-btn pill-btn-primary" onClick={() => navigateTo('receive')} style={{ flex: 1 }}>
              <ArrowDownLeft size={16} /> Receive
            </button>
          </>
        )}
        <button className="pill-btn pill-btn-secondary" onClick={() => navigateTo('swap')} style={{ flex: 1 }}>
          <ArrowLeftRight size={16} /> Swap
        </button>
        <button className="pill-btn pill-btn-secondary" onClick={() => navigateTo('history')} style={{ flex: 1 }}>
          <History size={16} /> History
        </button>
      </div>

      {!isCOOP && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 12 }}>
          Coopoint is earned through mining. Swap to Coopcoin to send to other users.
        </div>
      )}

      {/* Transaction History */}
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, color: 'var(--text-secondary)' }}>
        Transaction History
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {assetTxs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px 0', fontSize: 13 }}>
            No transactions yet
          </div>
        ) : assetTxs.slice(0, 20).map((t: Transaction) => (
          <div key={t.id} className="bubble-card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{t.txType}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {new Date(t.timestamp).toLocaleDateString()} · {t.status}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: ['receive','mining','task','admin'].includes(t.txType) ? 'var(--accent-green)' : 'var(--text-primary)' }}>
              {t.txType === 'send' || t.txType === 'swap' ? '−' : '+'}{fmt(t.amount || t.pointsAmount || 0)} {symbol}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};