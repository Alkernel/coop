import React, { useState } from 'react';
import { ChevronLeft, Copy, Check, Share2, Info } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useWallet } from '../context/WalletContext';

export const ReceiveScreen: React.FC = () => {
  const { goBack, account } = useWallet();
  const [copied, setCopied] = useState(false);

  const address = account?.address || '';

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'My COOP Wallet Address',
        text: address
      }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <div className="screen-content" style={{ minHeight: '100%', justifyContent: 'space-between' }}>
      <div>
        {/* Header */}
        <div className="screen-header">
          <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="receive-back-btn">
            <ChevronLeft size={22} />
          </button>
          <span className="screen-header-title">Receive</span>
          <div style={{ width: 40 }} />
        </div>

        {/* QR Code Container Card */}
        <div className="bubble-card bubble-card-elevated" style={{
          marginTop: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '28px 20px',
          textAlign: 'center'
        }}>
          {/* High contrast QR code frame (real wallet address only) */}
          {address ? (
          <div style={{
            background: '#ffffff',
            padding: 16,
            borderRadius: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            marginBottom: 20
          }}>
            <QRCodeSVG
              value={address}
              size={180}
              level="H"
              includeMargin={false}
            />
          </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>
              No wallet loaded.
            </div>
          )}

          <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Your COOP Wallet Address
          </span>

          {/* Address Box */}
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            wordBreak: 'break-all',
            padding: '10px 14px',
            background: 'var(--bg-input)',
            borderRadius: 14,
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            maxWidth: '100%',
            marginBottom: 16
          }}>
            {address || 'No wallet loaded.'}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button
              onClick={handleCopy}
              className="pill-btn pill-btn-primary"
              style={{ flex: 1, padding: '10px 16px', fontSize: 13 }}
              id="btn-copy-receive-address"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy Address'}</span>
            </button>

            <button
              onClick={handleShare}
              className="pill-btn pill-btn-secondary"
              style={{ padding: '10px 16px', width: 'auto' }}
              title="Share"
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>

        {/* Network Notice */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 16,
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontSize: 12,
          color: 'var(--text-secondary)'
        }}>
          <Info size={16} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
          <span>Only send COOPCoin and COOP Token (internal COOP transfers) to this address. No blockchain deposits yet.</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, paddingBottom: 12 }}>
        Network: COOP internal ledger (no blockchain hash yet)
      </div>
    </div>
  );
};
