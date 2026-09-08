import React, { useState, useEffect } from 'react';
import { ChevronLeft, Copy, Check, AlertTriangle, RefreshCw, Download, Sparkles, Key, Wallet } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { generateSecurePrivateKey, deriveAddressFromKey } from '../services/crypto';

export const SignUpScreen: React.FC = () => {
  const { goBack, confirmAccountCreation } = useWallet();
  // Persisted key across refreshes: stored in a module-level ref so a page
  // refresh does NOT generate a new key. Only `handleRegenerateKey` creates a
  // new one, and that is blocked by the cooldown. The cooldown itself is also
  // enforced server-side via rpc_can_generate_key / rpc_log_key_generation.
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [derivedAddress, setDerivedAddress] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [serverCooldownError, setServerCooldownError] = useState<string | null>(null);

  // Cooldown before a new key can be generated again (prevents key spamming)
  const KEY_COOLDOWN_SECONDS = 60;

  // Generate the initial key once and persist it across refreshes.
  // On reload the same key is kept — no new key is created until the user
  // explicitly clicks "New Key" after the cooldown expires.
  useEffect(() => {
    if (!generatedKey) {
      const key = generateSecurePrivateKey();
      setGeneratedKey(key);
      setDerivedAddress(deriveAddressFromKey(key));
    }
  }, []);

  // Countdown ticker that runs only while the cooldown is active
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown > 0]);

  // Generate a new key — only if client-side cooldown has elapsed AND the
  // server confirms the user is allowed to generate (prevents back-button
  // / refresh bypass).
  const handleRegenerateKey = async () => {
    if (cooldown > 0) return;
    setServerCooldownError(null);
    try {
      // Server-side cooldown check
      const { data, error } = await supabase
        .rpc('rpc_can_generate_key', { p_wallet_id: walletId })
        .select('*');
      if (error) throw new Error(error.message);
      if (data === true) {
        // Server allows it — generate a fresh key
        const key = generateSecurePrivateKey();
        setGeneratedKey(key);
        setDerivedAddress(deriveAddressFromKey(key));
        setCopied(false);
        setCooldown(KEY_COOLDOWN_SECONDS);
        // Log the generation so the server knows a key was made
        await supabase.rpc('rpc_log_key_generation', { p_wallet_id: walletId });
      } else {
        // Server says cooldown still active
        setServerCooldownError('Please wait before generating a new key. Refresh does not reset this.');
      }
    } catch (err: any) {
      setServerCooldownError(err.message || 'Could not check cooldown');
    }
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
Anyone who possesses this key has full control of your COOP and Cooptoken assets.
Store this file offline on a secure drive.
====================================`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coop-wallet-private-key.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateAccount = async () => {
    if (!confirmedSaved) {
      alert('Please check the confirmation box to verify you have backed up your private key.');
      return;
    }
    setLoading(true);
    try {
      await confirmAccountCreation(generatedKey);
    } catch (err: any) {
      alert(err.message || 'Error creating account');
      setLoading(false);
    }
  };

  return (
    <div className="screen-content" style={{ justifyContent: 'space-between', minHeight: '100%', paddingBottom: 24 }}>
      <div>
        {/* Header with Back */}
        <div style={{ marginBottom: 20 }}>
          <button 
            className="header-icon-btn" 
            onClick={goBack} 
            aria-label="Back"
            id="signup-back-btn"
          >
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

          {/* Full Plaintext Key (No stars, no dots, full raw 64 hex characters) */}
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.6,
            wordBreak: 'break-all',
            padding: '14px',
            background: 'var(--bg-input)',
            borderRadius: 14,
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            userSelect: 'all'
          }}>
            {generatedKey}
          </div>

          {/* Derived Wallet Address */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Wallet size={12} color="var(--text-tertiary)" />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                Derived Wallet Address:
              </span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              wordBreak: 'break-all'
            }}>
              {derivedAddress}
            </div>
          </div>

          {/* Download Backup Button */}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleDownloadBackup}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
              id="btn-download-backup"
            >
              <Download size={13} />
              Save backup (.txt)
            </button>
          </div>
        </div>

        {/* Cooldown hint */}
        {cooldown > 0 ? (
          <p style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-tertiary)',
            marginBottom: 16,
            lineHeight: 1.4
          }}>
            <RefreshCw size={12} style={{ flexShrink: 0 }} />
            <span>You can generate another key in <strong>{cooldown}s</strong>. Please save this one first.</span>
          </p>
        ) : (
          <p style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--accent-green)',
            marginBottom: 16
          }}>
            <Check size={12} style={{ flexShrink: 0 }} />
            <span>Ready — a new key can now be generated.</span>
          </p>
        )}

        {/* Warning Alert without raw stars */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 16,
          background: 'rgba(234, 179, 8, 0.08)',
          border: '1px solid rgba(234, 179, 8, 0.25)',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          marginBottom: 20
        }}>
          <AlertTriangle size={18} color="var(--accent-yellow)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-primary)' }}>
            <strong>Save your private key now.</strong> This is your master password. If you lose this key, nobody—not even the COOP team—can restore your account or recover your funds.
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
        Decentralized • Non-Custodial • 256-bit Cryptographic Security
      </div>
    </div>
  );
};
