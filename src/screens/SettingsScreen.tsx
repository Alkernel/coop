import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  User, 
  Shield, 
  Bell, 
  Globe, 
  Moon, 
  Sun, 
  Info, 
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { useTheme } from '../context/ThemeContext';
import { formatAddress } from '../services/crypto';

export const SettingsScreen: React.FC = () => {
  const { goBack, navigateTo, account, logout, updateAccountSettings } = useWallet();
  const { theme, toggleTheme } = useTheme();

  const [revealKey, setRevealKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const handleCopyKey = () => {
    if (!account?.privateKey) return;
    navigator.clipboard.writeText(account.privateKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2500);
  };

  const handleToggleNotifications = () => {
    if (account) {
      updateAccountSettings({ notificationsEnabled: !account.notificationsEnabled });
    }
  };

  return (
    <div className="screen-content" style={{ minHeight: '100%', justifyContent: 'space-between', paddingBottom: 20 }}>
      <div>
        {/* Header */}
        <div className="screen-header">
          <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="settings-back-btn">
            <ChevronLeft size={22} />
          </button>
          <span className="screen-header-title">Settings</span>
          <div style={{ width: 40 }} />
        </div>

        {/* Settings List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {/* Account */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => navigateTo('wallet_details')}
            id="settings-item-account"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <User size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Account</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {account?.address ? formatAddress(account.address, 6, 4) : ''}
                </div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>

          {/* Private Key Reveal */}
          <div
            className="bubble-card"
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <KeyRound size={20} color="var(--text-primary)" />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Private Key</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Your master secret — never share it
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevealKey(!revealKey)}
                style={{
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                id="btn-toggle-private-key"
              >
                {revealKey ? <EyeOff size={14} /> : <Eye size={14} />}
                {revealKey ? 'Hide' : 'Reveal'}
              </button>
            </div>

            {revealKey && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all', color: 'var(--text-primary)', lineHeight: 1.5, padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 10, userSelect: 'all' }}>
                  {account?.privateKey || 'Key unavailable'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <AlertTriangle size={14} color="var(--accent-yellow)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--accent-red)', lineHeight: 1.35 }}>
                    Anyone with this key has full control of your wallet. Copy it to a secure, offline location and do not share it.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  style={{
                    background: 'var(--btn-primary-bg)',
                    border: 'none',
                    color: 'var(--btn-primary-text)',
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    marginTop: 8
                  }}
                  id="btn-copy-key-settings"
                >
                  {keyCopied ? <Check size={14} /> : <Copy size={14} />}
                  {keyCopied ? 'Copied to clipboard' : 'Copy private key'}
                </button>
              </div>
            )}
          </div>

          {/* Security */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => navigateTo('security')}
            id="settings-item-security"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Shield size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Security</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  PIN & Biometric Lock
                </div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>

          {/* Notifications Toggle */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Bell size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Notifications</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Push Notifications
                </div>
              </div>
            </div>
            
            {/* Toggle Switch */}
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={account?.notificationsEnabled ?? true} 
                onChange={handleToggleNotifications}
                style={{ opacity: 0, width: 0, height: 0 }} 
                id="toggle-notifications"
              />
              <span style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: (account?.notificationsEnabled ?? true) ? 'var(--text-primary)' : 'var(--border-color)',
                borderRadius: 9999,
                transition: '0.3s'
              }}>
                <span style={{
                  position: 'absolute',
                  content: '""',
                  height: 20,
                  width: 20,
                  left: (account?.notificationsEnabled ?? true) ? 21 : 3,
                  bottom: 3,
                  backgroundColor: (account?.notificationsEnabled ?? true) ? 'var(--bg-app)' : '#ffffff',
                  borderRadius: '50%',
                  transition: '0.3s'
                }} />
              </span>
            </label>
          </div>

          {/* Language */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Globe size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Language</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>English</div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>

          {/* Appearance Toggle */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={toggleTheme}
            id="settings-toggle-theme"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {theme === 'dark' ? <Moon size={20} color="var(--text-primary)" /> : <Sun size={20} color="var(--text-primary)" />}
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Appearance</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                </div>
              </div>
            </div>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 8,
              background: 'var(--bg-glass-active)',
              border: '1px solid var(--border-color)'
            }}>
              Switch
            </span>
          </div>

          {/* About COOP */}
          <div 
            className="bubble-card" 
            style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => navigateTo('about')}
            id="settings-item-about"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Info size={20} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>About COOP</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Version 1.0.0</div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>
        </div>
      </div>

      {/* Log Out Button */}
      <div style={{ paddingTop: 20 }}>
        <button
          className="pill-btn pill-btn-secondary"
          onClick={logout}
          style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--accent-red)' }}
          id="btn-logout"
        >
          <LogOut size={16} />
          Log Out
        </button>
      </div>
    </div>
  );
};
