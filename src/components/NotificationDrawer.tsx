import React from 'react';
import { X, Bell, CheckCircle, ArrowDownLeft, Zap } from 'lucide-react';
import { useWallet } from '../context/WalletContext';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose }) => {
  const { notifications, markNotificationsAsRead } = useWallet();

  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} />
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>Notifications</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={markNotificationsAsRead}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
            >
              Mark read
            </button>
            <button
              onClick={onClose}
              style={{ background: 'var(--bg-glass)', border: 'none', color: 'var(--text-primary)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: '55vh', paddingBottom: 10 }}>
          {notifications.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px 0', fontSize: 14 }}>No notifications yet</p>
          ) : (
            notifications.map(n => (
              <div 
                key={n.id} 
                style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: n.read ? 'var(--bg-surface)' : 'var(--bg-glass-active)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start'
                }}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--bg-glass)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {n.type === 'success' && <CheckCircle size={16} color="var(--accent-green)" />}
                  {n.type === 'mining' && <Zap size={16} color="var(--accent-yellow)" />}
                  {n.type === 'tx' && <ArrowDownLeft size={16} color="var(--accent-blue)" />}
                  {n.type === 'info' && <Bell size={16} color="var(--text-secondary)" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{n.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
