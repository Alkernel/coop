import React, { useState } from 'react';
import { ScanFace, Fingerprint, Lock, Globe, Send, KeyRound } from 'lucide-react';
import { XIcon } from '../components/XIcon';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';

export const WalletLockScreen: React.FC = () => {
  const { unlockWallet, account } = useWallet();
  const [pin, setPin] = useState('');
  const [showPinPad, setShowPinPad] = useState(false);
  const [error, setError] = useState(false);

  const handleBiometricUnlock = () => {
    // Biometric unlock simulation
    const ok = unlockWallet('biometric');
    if (!ok) {
      setError(true);
      setTimeout(() => setError(false), 1500);
    }
  };

  const handleNumClick = (num: string) => {
    if (pin.length < 6) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 6) {
        // No hardcoded fallback PIN: unlock only when a real PIN is set.
        if (account?.pinCode && nextPin === account.pinCode) {
          unlockWallet(nextPin);
        } else {
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 800);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="screen-content" style={{ minHeight: '100%', justifyContent: 'space-between', paddingBottom: 24, textAlign: 'center' }}>
      {/* Top Branding */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <CoopLogo size={70} glow />
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '0.5px' }}>COOP</h1>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 14px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Lock size={18} /> Wallet Locked
        </h2>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 280, marginBottom: 20 }}>
          COOP is a next-generation token designed to power the mining, trading, and growth ecosystem. More than a token — it's a community.
        </p>

        {/* Info Rows matching Mockup 18 */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          <div className="bubble-card" style={{ padding: '10px 16px', marginBottom: 0, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <Globe size={15} /> Website
            </span>
            <span style={{ fontWeight: 600 }}>coopcoin.com</span>
          </div>

          <div className="bubble-card" style={{ padding: '10px 16px', marginBottom: 0, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <XIcon size={15} /> X (Twitter)
            </span>
            <span style={{ fontWeight: 600 }}>@coopcoin</span>
          </div>

          <div className="bubble-card" style={{ padding: '10px 16px', marginBottom: 0, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <Send size={15} /> Telegram
            </span>
            <span style={{ fontWeight: 600 }}>t.me/coopcoin</span>
          </div>

          <div className="bubble-card" style={{ padding: '10px 16px', marginBottom: 0, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Version</span>
            <span style={{ fontWeight: 600 }}>1.0.0</span>
          </div>
        </div>
      </div>

      {/* PIN Input or Biometric Prompt */}
      {showPinPad ? (
        <div style={{ width: '100%', maxWidth: 280, margin: '0 auto' }}>
          {/* PIN Dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
            {[0, 1, 2, 3, 4, 5].map(idx => (
              <div
                key={idx}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid var(--text-primary)',
                  backgroundColor: pin.length > idx ? (error ? 'var(--accent-red)' : 'var(--text-primary)') : 'transparent',
                  transition: '0.2s'
                }}
              />
            ))}
          </div>

          {/* Keypad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Bio', '0', '⌫'].map(item => (
              <button
                key={item}
                onClick={() => {
                  if (item === 'Bio') setShowPinPad(false);
                  else if (item === '⌫') handleDelete();
                  else handleNumClick(item);
                }}
                style={{
                  height: 50,
                  borderRadius: '50%',
                  background: 'var(--bg-glass-active)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: item.length > 1 ? 13 : 18,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {item === 'Bio' ? <Fingerprint size={20} /> : item}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Biometric Action Buttons matching mockup Screen 18 */
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
            <button
              onClick={handleBiometricUnlock}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
              id="btn-face-id"
            >
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--bg-glass-active)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <ScanFace size={28} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Face ID</span>
            </button>

            <button
              onClick={handleBiometricUnlock}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
              id="btn-fingerprint"
            >
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--bg-glass-active)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Fingerprint size={28} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Fingerprint</span>
            </button>
          </div>

          <button
            onClick={() => setShowPinPad(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <KeyRound size={14} /> Enter PIN
          </button>
        </div>
      )}
    </div>
  );
};
