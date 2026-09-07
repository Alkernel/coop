import React, { useState } from 'react';
import { ChevronLeft, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { useWallet } from '../context/WalletContext';

export const LoginScreen: React.FC = () => {
  const { navigateTo, goBack, loginWithPrivateKey } = useWallet();
  const [privateKey, setPrivateKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanKey = privateKey.trim();
    if (!cleanKey) {
      setError('Please enter your private key');
      return;
    }

    setLoading(true);
    try {
      const success = await loginWithPrivateKey(cleanKey);
      if (!success) {
        setError('Invalid private key or account not found. If this is your first time, please click "Get Started" below to generate your account.');
      }
    } catch (err: any) {
      setError(err.message || 'Error authenticating private key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-content" style={{ justifyContent: 'space-between', minHeight: '100%', paddingBottom: 20 }}>
      <div>
        {/* Header with Back */}
        <div style={{ marginBottom: 28 }}>
          <button 
            className="header-icon-btn" 
            onClick={goBack} 
            aria-label="Back"
            id="login-back-btn"
          >
            <ChevronLeft size={22} />
          </button>
        </div>

        {/* Title & Intro */}
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 10, lineHeight: 1.2 }}>
          Login with<br />Private Key
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.5 }}>
          Enter your private key to access your wallet and account.
        </p>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <input
              type={showKey ? 'text' : 'password'}
              className="input-bubble"
              placeholder="Enter your private key"
              value={privateKey}
              onChange={e => {
                setPrivateKey(e.target.value);
                setError('');
              }}
              style={{ paddingRight: 48, fontFamily: showKey ? 'var(--font-mono)' : 'inherit', fontSize: 14 }}
              autoComplete="off"
              autoFocus
              id="input-private-key"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div style={{ 
              padding: '10px 14px', 
              borderRadius: 12, 
              background: 'rgba(239, 68, 68, 0.1)', 
              color: 'var(--accent-red)', 
              fontSize: 13, 
              marginBottom: 20, 
              lineHeight: 1.4 
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="pill-btn pill-btn-primary"
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1 }}
            id="login-submit-btn"
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>

        {/* Switch to SignUp */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Don't have a key? </span>
          <button
            type="button"
            onClick={() => navigateTo('signup')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
            id="login-get-started-btn"
          >
            Get Started
          </button>
        </div>
      </div>

      {/* Security Tip Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 12, paddingTop: 20 }}>
        <ShieldCheck size={16} />
        <span>Your key is your access. Keep it safe.</span>
      </div>
    </div>
  );
};
