import React, { useState } from 'react';
import { ChevronLeft, Copy, Check, ArrowUpRight, ArrowDownLeft, Shield } from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';
import { formatAddress } from '../services/crypto';

export const WalletDetailsScreen: React.FC = () => {
  const { goBack, account, navigateTo } = useWallet();
  const [copied, setCopied] = useState(false);

  const address = account?.address || '';
  const coopBalance = account?.coopBalance || 0;
  const cooptokenBalance = account?.cooptokenBalance || 0;
  const totalSent = account?.totalSent || 0;
  const totalReceived = account?.totalReceived || 0;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="wallet-details-back-btn">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Wallet</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Central Emblem & Balance */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0 24px 0',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: 16 }}>
          <CoopLogo size={76} glow />
        </div>

        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
          COOPCoin Balance
        </span>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.5px', margin: '4px 0' }}>
          {coopBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COOPCoin
        </div>
      </div>

      {/* Wallet Address Card with Copy */}
      <div className="bubble-card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Wallet Address
          </span>
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              color: copied ? 'var(--accent-green)' : 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 600
            }}
            id="btn-copy-address-details"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          wordBreak: 'break-all',
          color: 'var(--text-primary)'
        }}>
          {address || 'No wallet loaded.'}
        </div>
      </div>

      {/* Pre-TGE Mining Balance Card */}
      <div className="bubble-card" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Mining Balance (COOP Token)
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>
            {cooptokenBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COOP Token
          </div>
        </div>
        <button
          onClick={() => navigateTo('swap')}
          className="pill-btn pill-btn-primary"
          style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }}
        >
          Swap
        </button>
      </div>

      {/* Sent & Received Stats (2 Columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="bubble-card" style={{ padding: '16px 14px', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            <ArrowUpRight size={15} />
            <span>Total Sent</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {totalSent.toFixed(2)} COOP
          </div>
        </div>

        <div className="bubble-card" style={{ padding: '16px 14px', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            <ArrowDownLeft size={15} color="var(--accent-green)" />
            <span>Total Received</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {totalReceived.toFixed(2)} COOP
          </div>
        </div>
      </div>
    </div>
  );
};
