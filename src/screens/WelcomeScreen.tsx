import React from 'react';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';

export const WelcomeScreen: React.FC = () => {
  const { navigateTo } = useWallet();

  return (
    <div className="screen-content" style={{ justifyContent: 'space-between', paddingBottom: 32, minHeight: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingTop: 40 }}>
        {/* COOP Logo */}
        <div style={{ marginBottom: 24 }}>
          <CoopLogo size={88} glow animated />
        </div>

        {/* Brand Name */}
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '1px', marginBottom: 6 }}>
          COOP
        </h1>

        {/* Tagline */}
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24 }}>
          Mine. Trade. Grow.
        </h2>

        {/* Description */}
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 220 }}>
          Your wallet, your mining,<br />your future.
        </p>

        {/* Graphic Fluid Wave SVG */}
        <div style={{ width: '100%', maxWidth: 300, margin: '30px 0', opacity: 0.35 }}>
          <svg viewBox="0 0 300 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
            <path
              d="M0 40C60 10 90 70 150 40C210 10 240 70 300 40"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M0 50C70 20 80 65 150 45C220 25 230 65 300 50"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              strokeOpacity="0.6"
            />
          </svg>
        </div>
      </div>

      {/* Bottom Auth Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button 
          className="pill-btn pill-btn-primary"
          onClick={() => navigateTo('login')}
          id="welcome-signin-btn"
        >
          Sign In
        </button>

        <button 
          className="pill-btn pill-btn-secondary"
          onClick={() => navigateTo('signup')}
          id="welcome-create-btn"
        >
          Create Account
        </button>
      </div>
    </div>
  );
};
