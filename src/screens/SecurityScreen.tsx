import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Key, Fingerprint, Lock, Shield, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useWallet } from '../context/WalletContext';

export const SecurityScreen: React.FC = () => {
  const { goBack, account, updateAccountSettings, lockWallet } = useWallet();
  const [showPinModal, setShowPinModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinInputForKey, setPinInputForKey] = useState('');
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [msg, setMsg] = useState('');

  const [pinError, setPinError] = useState('');

  const handlePinChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4) {
      setPinError('PIN must be at least 4 digits');
      return;
    }
    setPinError('');
    updateAccountSettings({ pinCode: newPin });
    setShowPinModal(false);
    setNewPin('');
    setMsg('PIN updated successfully');
    setTimeout(() => setMsg(''), 2500);
  };

  const handleRevealKey = (e: React.FormEvent) => {
    e.preventDefault();
    // No hardcoded fallback PIN: an unset PIN must be created first.
    if (account?.pinCode && pinInputForKey === account.pinCode) {
      setKeyRevealed(true);
      setPinError('');
    } else {
      setPinError('Incorrect PIN');
    }
  };

  const handleCopyKey = () => {
    if (account?.privateKey) {
      navigator.clipboard.writeText(account.privateKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="screen-content" style={{ minHeight: '100%', justifyContent: 'space-between', paddingBottom: 20 }}>
      <div>
        {/* Header */}
        <div className="screen-header">
          <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="security-back-btn">
            <ChevronLeft size={22} />
          </button>
          <span className="screen-header-title">Security</span>
          <div style={{ width: 40 }} />
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--accent-green-bg)', color: 'var(--accent-green)', fontSize: 13, margin: '10px 0' }}>
            {msg}
          </div>
        )}

        {/* Security Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {/* Change PIN */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowPinModal(true)}
            id="btn-change-pin"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Key size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Change PIN</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Update your 6-digit PIN</div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>

          {/* Biometric Unlock */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Fingerprint size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Biometric Unlock</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Use Face ID or Fingerprint</div>
              </div>
            </div>

            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={account?.biometricsEnabled ?? true} 
                onChange={() => updateAccountSettings({ biometricsEnabled: !(account?.biometricsEnabled ?? true) })}
                style={{ opacity: 0, width: 0, height: 0 }} 
                id="toggle-biometrics"
              />
              <span style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: (account?.biometricsEnabled ?? true) ? 'var(--text-primary)' : 'var(--border-color)',
                borderRadius: 9999,
                transition: '0.3s'
              }}>
                <span style={{
                  position: 'absolute',
                  content: '""',
                  height: 20,
                  width: 20,
                  left: (account?.biometricsEnabled ?? true) ? 21 : 3,
                  bottom: 3,
                  backgroundColor: (account?.biometricsEnabled ?? true) ? 'var(--bg-app)' : '#ffffff',
                  borderRadius: '50%',
                  transition: '0.3s'
                }} />
              </span>
            </label>
          </div>

          {/* Auto-Lock */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Lock size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Auto-Lock</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lock after 5 minutes</div>
              </div>
            </div>

            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                defaultChecked 
                style={{ opacity: 0, width: 0, height: 0 }} 
              />
              <span style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'var(--text-primary)',
                borderRadius: 9999
              }}>
                <span style={{
                  position: 'absolute',
                  content: '""',
                  height: 20,
                  width: 20,
                  left: 21,
                  bottom: 3,
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: '50%'
                }} />
              </span>
            </label>
          </div>

          {/* Recovery Phrase / Private Key */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => {
              setShowKeyModal(true);
              setKeyRevealed(false);
              setPinInputForKey('');
            }}
            id="btn-reveal-recovery"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Key size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Recovery Phrase</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Backup your private key</div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>

          {/* Security Info */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Shield size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Security Info</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Learn about wallet security</div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>
        </div>
      </div>

      {/* Lock Wallet Now Button */}
      <div style={{ paddingTop: 20 }}>
        <button
          className="pill-btn pill-btn-primary"
          onClick={lockWallet}
          id="btn-lock-wallet-now"
        >
          <Lock size={16} />
          Lock Wallet Now
        </button>
      </div>

      {/* Change PIN Modal */}
      {showPinModal && (
        <div className="drawer-backdrop" onClick={() => setShowPinModal(false)}>
          <div className="drawer-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14, textAlign: 'center' }}>Set New Security PIN</h3>
            <form onSubmit={handlePinChange}>
              {pinError && (
                <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', fontSize: 13, marginBottom: 12 }}>
                  {pinError}
                </div>
              )}
              <input
                type="password"
                maxLength={6}
                className="input-bubble"
                placeholder="Enter 6-digit PIN"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: 22, marginBottom: 16 }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="pill-btn pill-btn-secondary" onClick={() => setShowPinModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="pill-btn pill-btn-primary" style={{ flex: 1 }}>
                  Save PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reveal Key Modal */}
      {showKeyModal && (
        <div className="drawer-backdrop" onClick={() => setShowKeyModal(false)}>
          <div className="drawer-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14, textAlign: 'center' }}>Private Key Backup</h3>
            
            {!keyRevealed ? (
              <form onSubmit={handleRevealKey}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, textAlign: 'center' }}>
                  Enter your wallet PIN to reveal your private key.
                </p>
                {pinError && (
                  <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', fontSize: 13, marginBottom: 12 }}>
                    {pinError}
                  </div>
                )}
                <input
                  type="password"
                  maxLength={6}
                  className="input-bubble"
                  placeholder="PIN"
                  value={pinInputForKey}
                  onChange={e => setPinInputForKey(e.target.value.replace(/\D/g, ''))}
                  style={{ textAlign: 'center', letterSpacing: '8px', fontSize: 22, marginBottom: 16 }}
                  autoFocus
                />
                <button type="submit" className="pill-btn pill-btn-primary">
                  Verify & Reveal
                </button>
              </form>
            ) : (
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  wordBreak: 'break-all',
                  padding: '12px 14px',
                  background: 'var(--bg-input)',
                  borderRadius: 14,
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  marginBottom: 16
                }}>
                  {account?.privateKey}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="pill-btn pill-btn-secondary" onClick={() => setShowKeyModal(false)} style={{ flex: 1 }}>
                    Close
                  </button>
                  <button className="pill-btn pill-btn-primary" onClick={handleCopyKey} style={{ flex: 1 }}>
                    {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                    {copiedKey ? 'Copied' : 'Copy Key'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
