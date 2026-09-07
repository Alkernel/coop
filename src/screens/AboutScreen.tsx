import React from 'react';
import { ChevronLeft, Globe, Send, ShieldCheck, ExternalLink } from 'lucide-react';
import { XIcon } from '../components/XIcon';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';

export const AboutScreen: React.FC = () => {
  const { goBack } = useWallet();

  return (
    <div className="screen-content" style={{ paddingBottom: 20 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="about-back-btn">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">About COOP</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Center Branding */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 0 20px 0',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: 14 }}>
          <CoopLogo size={68} glow />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.5px' }}>COOP Wallet</h2>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Version 1.0.0 (Pre-TGE Build)</span>

        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 16, maxWidth: 300 }}>
          COOP is a next-generation decentralized mobile token ecosystem designed to power mining, trading, and community growth.
        </p>
      </div>

      {/* Info Links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        <div className="bubble-card" style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Globe size={18} color="var(--text-primary)" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Website</span>
          </div>
          <a href="https://coopcoin.com" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            coopcoin.com <ExternalLink size={12} />
          </a>
        </div>

        <div className="bubble-card" style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <XIcon size={18} color="var(--text-primary)" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>X (Twitter)</span>
          </div>
          <a href="https://x.com/coopcoin" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            @coopcoin <ExternalLink size={12} />
          </a>
        </div>

        <div className="bubble-card" style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Send size={18} color="var(--text-primary)" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Telegram</span>
          </div>
          <a href="https://t.me/coopcoin" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            t.me/coopcoin <ExternalLink size={12} />
          </a>
        </div>

        <div className="bubble-card" style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShieldCheck size={18} color="var(--accent-green)" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Security Audit</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>Verified Passed</span>
        </div>
      </div>
    </div>
  );
};
