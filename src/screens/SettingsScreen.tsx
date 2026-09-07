import React from 'react';
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
  LogOut 
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { useTheme } from '../context/ThemeContext';
import { formatAddress } from '../services/crypto';

export const SettingsScreen: React.FC = () => {
  const { goBack, navigateTo, account, logout, updateAccountSettings } = useWallet();
  const { theme, toggleTheme } = useTheme();

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
                  Private Key {account?.address ? formatAddress(account.address, 6, 4) : '0x7a3f...9c2e'}
                </div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--text-tertiary)" />
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
