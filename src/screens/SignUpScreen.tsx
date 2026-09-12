import React, { useState, useEffect } from 'react';
import { ChevronLeft, Copy, Check, AlertTriangle, RefreshCw, Download, Key, Wallet } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { generateSecurePrivateKey, deriveAddressFromKey, isValidPrivateKey } from '../services/crypto';

export const SignUpScreen: React.FC = () => {
  const { goBack, confirmAccountCreation } = useWallet();

  // Keys and cooldown are persisted in sessionStorage so a page refresh does
  // NOT generate a new key and does NOT reset the countdown. The same key is
  // shown until the user explicitly clicks "New Key" after the cooldown
  // expires, preventing refresh-based bypasses.
  const KEY_STORAGE = 'coop_signup_generated_key_v1';
  const ADDR_STORAGE = 'coop_signup_generated_addr_v1';
  const COOLDOWN_KEY = 'coop_signup_key_cooldown_v1';
  const KEY_COOLDOWN_SECONDS = 60;

  const [generatedKey, setGeneratedKey] = useState<string>(() => {
    const stored = sessionStorage.getItem(KEY_STORAGE);
    return stored && isValidPrivateKey(stored) ? stored : '';
  });
  const [derivedAddress, setDerivedAddress] = useState<string>(() =>
    sessionStorage.getItem(ADDR_STORAGE) || ''
  );
  const [copied, setCopied] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [formError, setFormError] = useState('');

  // Persist a freshly generated key so it survives a refresh.
  const persistKey = (key: string) => {
    const addr = deriveAddressFromKey(key);
    sessionStorage.setItem(KEY_STORAGE, key);
    sessionStorage.setItem(ADDR_STORAGE, addr);
    setGeneratedKey(key);
    setDerivedAddress(addr);
    setCopied(false);
  };

  const applyCooldown = (seconds: number) => {
    const expiry = Date.now() + seconds * 1000;
    sessionStorage.setItem(COOLDOWN_KEY, expiry.toString());
    setCooldown(seconds);
  };

  const checkPersistedCooldown = (): number => {
    const stored = sessionStorage.getItem(COOLDOWN_KEY);
    if (!stored) return 0;
    const expiry = parseInt(stored, 10);
    if (Date.now() >= expiry) {
      sessionStorage.removeItem(COOLDOWN_KEY);
      return 0;
    }
    return Math.ceil((expiry - Date.now()) / 1000);
  };

  // On mount: restore any persisted key + cooldown. Generate one key the very
  // first time (and lock regeneration behind the cooldown).
  useEffect(() => {
    const remaining = checkPersistedCooldown();
    setCooldown(remaining);
    if (!generatedKey) {
      persistKey(generateSecurePrivateKey());
      if (remaining <= 0) applyCooldown(KEY_COOLDOWN_SECONDS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown ticker that runs only while the cooldown is active.
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          sessionStorage.removeItem(COOLDOWN_KEY);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown > 0]);

  // Generate a new private key, blocked while the cooldown is active. Since the
  // cooldown is persisted across refreshes, refreshing does NOT bypass it.
  const handleRegenerateKey = () => {
    if (cooldown > 0) return;
    persistKey(generateSecurePrivateKey());
    applyCooldown(KEY_COOLDOWN_SECONDS);
  };

  const handleCopy = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadBackup = () => {
    const content = `====================================
COOP WALLET - ACCOUNT BACKUP
====================================
Generated: ${new Date().toUTCString()}

PRIVATE KEY (Keep 100% secret):
${generatedKey}

WALLET ADDRESS:
${derivedAddress}

WARNING:
Never share your private key with anyone.
Anyone who possesses this key has full control of your COOP assets.
Store this file offline on a secure drive.
====================================`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coop-wallet-private-key.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateAccount = async () => {
    if (!confirmedSaved) {
      setFormError('Please check the confirmation box to verify you have backed up your private key.');
      return;
    }
    setFormError('');
    setLoading(true);
    try {
      await confirmAccountCreation(generatedKey);
    } catch (err: any) {
      setFormError(err.message || 'Error creating account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-content" style={{ justifyContent: 'space-between', minHeight: '100%', paddingBottom: 24 }}>
      <div>
        {/* Header with Back */}
        <div style={{ marginBottom: 20 }}>
          <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="signup-back-btn">
            <ChevronLeft size={22} />
          </button>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>
          Create Your Account
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
          Your account is secured by your unique private key. No email, no password, no verification required.
        </p>
{/* Generated Key Bubble Card */}
        <div className="bubble-card bubble-card-elevated" style={{ border: '1px solid var(--border-focus)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Key size={16} color="var(--accent-green)" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-primary)' }}>
                Your Generated Private Key
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={handleRegenerateKey}
                disabled={cooldown > 0}
                style={{
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '4px 8px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: cooldown > 0 ? 0.55 : 1
                }}
                title={cooldown > 0 ? `Wait ${cooldown}s to generate a new key` : 'Generate another key'}
                id="btn-regenerate-key"
              >
                <RefreshCw size={11} />
                {cooldown > 0 ? `${cooldown}s` : 'New Key'}
              </button>

              <button
                type="button"
                onClick={handleCopy}
                style={{
                  background: 'var(--btn-primary-bg)',
                  border: 'none',
                  color: 'var(--btn-primary-text)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
                id="btn-copy-private-key"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Key display */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, wordBreak: 'break-all', color: 'var(--text-primary)', lineHeight: 1.5, userSelect: 'all' }}>
            {generatedKey}
          </div>
          {derivedAddress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <Wallet size={13} color="var(--text-tertiary)" />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {derivedAddress}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="pill-btn pill-btn-secondary"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            id="btn-download-backup"
          >
            <Download size={13} />
            Save backup (.txt)
          </button>
        </div>

        {/* Cooldown hint */}
        {cooldown > 0 ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16, lineHeight: 1.4 }}>
            <RefreshCw size={12} style={{ flexShrink: 0 }} />
            <span>You can generate another key in <strong>{cooldown}s</strong>. Please save this one first.</span>
          </p>
        ) : (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-green)', marginBottom: 16 }}>
            <Check size={12} style={{ flexShrink: 0 }} />
            <span>Ready — a new key can now be generated.</span>
          </p>
        )}
{/* Warning Alert */}
        <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20 }}>
          <AlertTriangle size={18} color="var(--accent-yellow)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-primary)' }}>
            <strong>Save your private key now.</strong> This is your master password. If you lose this key, nobody - not even the COOP team - can restore your account or recover your funds.
          </div>
        </div>

        {/* Confirmation Checkbox */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={confirmedSaved}
            onChange={e => setConfirmedSaved(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: 'var(--btn-primary-bg)', cursor: 'pointer', marginTop: 2 }}
            id="confirm-saved-checkbox"
          />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            I have written down or saved my private key in a secure place.
          </span>
        </label>

        {/* Create Account Button */}
        {formError && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', fontSize: 13, marginBottom: 12 }}>
            {formError}
          </div>
        )}
        <button
          className="pill-btn pill-btn-primary"
          onClick={handleCreateAccount}
          disabled={loading || !confirmedSaved}
          style={{ opacity: !confirmedSaved || loading ? 0.6 : 1 }}
          id="signup-create-btn"
        >
          {loading ? 'Creating Account...' : 'Create Account & Access Wallet'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 14 }}>
          By continuing, you agree to our Terms & Conditions and Privacy Policy.
        </p>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, paddingTop: 16 }}>
        Decentralized - Non-Custodial - 256-bit Cryptographic Security
      </div>
    </div>
  );
};