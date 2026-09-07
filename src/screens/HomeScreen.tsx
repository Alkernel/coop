import React, { useState } from 'react';
import { Bell, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, History, Zap, ChevronRight } from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';
import { NotificationDrawer } from '../components/NotificationDrawer';

export const HomeScreen: React.FC = () => {
  const { 
    account, 
    navigateTo, 
    unreadNotificationsCount, 
    miningSession, 
    isMiningActive 
  } = useWallet();

  const [showNotifications, setShowNotifications] = useState(false);

  // Approximate USD values
  const coopPrice = 0.199;
  const coopBalance = account?.coopBalance || 0;
  const totalUsd = (coopBalance * coopPrice).toFixed(2);
  const cooptokenBalance = account?.cooptokenBalance || 0;

  // Today's mining reward calculation
  const rewardTotal = miningSession?.totalReward || (50 + (account?.totalBoostReward || 0));
  const rewardUsd = (rewardTotal * (coopPrice / 1000) * 200).toFixed(2); // estimated value projection

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CoopLogo size={28} />
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.5px' }}>COOP</span>
        </div>

        <button 
          className="header-icon-btn" 
          onClick={() => setShowNotifications(true)}
          style={{ position: 'relative' }}
          id="btn-notifications"
          aria-label="Notifications"
        >
          <Bell size={19} />
          {unreadNotificationsCount > 0 && (
            <span style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'var(--accent-red)',
              boxShadow: '0 0 4px var(--accent-red)'
            }} />
          )}
        </button>
      </div>

      {/* Total Balance Card */}
      <div className="bubble-card bubble-card-elevated" style={{ background: 'var(--bg-surface)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Total Balance</span>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.5px', margin: '6px 0 10px 0' }}>
          $ {totalUsd}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
            <span>= {coopBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COOP</span>
            <span className="badge-tag badge-green">
              ▲ +{account?.currentBoostPct || 15}%
            </span>
          </div>

          <div style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            background: 'var(--bg-glass)',
            padding: '3px 8px',
            borderRadius: 8,
            border: '1px solid var(--border-color)'
          }}>
            {cooptokenBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} Cooptoken (Mining)
          </div>
        </div>
      </div>

      {/* 4 Action Circle Buttons (Send, Receive, Swap, History) */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '4px 0 20px 0' }}>
        <button 
          className="quick-action-btn" 
          onClick={() => navigateTo('send')}
          id="action-send"
        >
          <div className="quick-action-circle">
            <ArrowUpRight size={20} strokeWidth={2.2} />
          </div>
          <span className="quick-action-label">Send</span>
        </button>

        <button 
          className="quick-action-btn" 
          onClick={() => navigateTo('receive')}
          id="action-receive"
        >
          <div className="quick-action-circle">
            <ArrowDownLeft size={20} strokeWidth={2.2} />
          </div>
          <span className="quick-action-label">Receive</span>
        </button>

        <button 
          className="quick-action-btn" 
          onClick={() => navigateTo('swap')}
          id="action-swap"
        >
          <div className="quick-action-circle">
            <ArrowLeftRight size={20} strokeWidth={2.2} />
          </div>
          <span className="quick-action-label">Swap</span>
        </button>

        <button 
          className="quick-action-btn" 
          onClick={() => navigateTo('history')}
          id="action-history"
        >
          <div className="quick-action-circle">
            <History size={20} strokeWidth={2.2} />
          </div>
          <span className="quick-action-label">History</span>
        </button>
      </div>

      {/* Mining Power Card */}
      <div 
        className="bubble-card" 
        onClick={() => navigateTo('mining')}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Mining Power</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Level {account?.miningPowerLevel || 1}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="custom-progress-track" style={{ flex: 1 }}>
            <div className="custom-progress-fill" style={{ width: '45%' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>45%</span>
        </div>
      </div>

      {/* Today's Reward Card */}
      <div 
        className="bubble-card" 
        onClick={() => navigateTo('mining')}
        style={{ 
          cursor: 'pointer',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--bg-glass-active)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)'
          }}>
            <Zap size={20} fill={isMiningActive ? 'currentColor' : 'none'} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 2 }}>
              Today's Reward
            </div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              +{rewardTotal.toFixed(2)} Cooptoken
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            ≈ ${rewardUsd}
          </span>
          <ChevronRight size={16} color="var(--text-tertiary)" />
        </div>
      </div>

      {/* Notification Modal Drawer */}
      <NotificationDrawer 
        isOpen={showNotifications} 
        onClose={() => setShowNotifications(false)} 
      />
    </div>
  );
};
