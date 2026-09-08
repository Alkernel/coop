import React, { useState } from 'react';
import { Bell, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, History, Zap, ChevronRight } from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { CoinIcon } from '../components/CoinIcon';
import { useWallet } from '../context/WalletContext';
import { NotificationDrawer } from '../components/NotificationDrawer';

export const HomeScreen: React.FC = () => {
  const {
    account, 
    navigateTo, 
    unreadNotificationsCount, 
    miningStatus,
    isMiningActive 
  } = useWallet();

  const [showNotifications, setShowNotifications] = useState(false);

  // Approximate USD values
  const coopPrice = 0.199;
  const coopBalance = account?.coopBalance || 0;
  const totalUsd = (coopBalance * coopPrice).toFixed(2);
  const cooptokenBalance = account?.cooptokenBalance || 0;

  // Real values from the backend mining status
  const boostPct = miningStatus?.boostPct ?? 0;
  const effectiveRate = (miningStatus?.rate ?? 50) * (1 + boostPct / 100);
  const hoursToday = miningStatus?.hoursMinedToday ?? 0;
  const dailyHours = miningStatus?.dailyHours ?? 12;
  const miningPowerPct = Math.min(100, Math.round((hoursToday / dailyHours) * 100));

  // Today's mining earnings (server-side value)
  const rewardTotal = miningStatus?.pointsEarnedToday ?? 0;
  const rewardUsd = (rewardTotal * (coopPrice / 10)).toFixed(2); // estimated projection

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
              ▲ +{boostPct}%
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

      {/* Assets / Networks */}
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Assets</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>BEP-20 Network</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {[
          {
            coin: 'COOP' as const,
            name: 'Coopcoin',
            network: 'Coop Mainnet · BEP-20',
            balance: coopBalance,
            usd: (coopBalance * coopPrice).toFixed(2),
            soon: false
          },
          {
            coin: 'COOPTOKEN' as const,
            name: 'Cooptoken',
            network: 'Mining Points · Swaps 1,000 → 1 COOP',
            balance: cooptokenBalance,
            usd: (cooptokenBalance * coopPrice / 1000).toFixed(2),
            soon: false
          },
          {
            coin: 'USDT' as const,
            name: 'USDT',
            network: 'BEP-20 · Buy Boost & Miners',
            balance: 0,
            usd: '0.00',
            soon: true
          }
        ].map(asset => (
          <div key={asset.coin} className="bubble-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CoinIcon coin={asset.coin} size={38} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {asset.name}
                  {asset.soon && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                      padding: '2px 6px', borderRadius: 6,
                      background: 'var(--bg-glass-active)', border: '1px solid var(--border-color)',
                      color: 'var(--text-tertiary)'
                    }}>SOON</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{asset.network}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {asset.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>≈ ${asset.usd}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Mining Power Card */}
      <div 
        className="bubble-card" 
        onClick={() => navigateTo('mining')}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Mining Today</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {effectiveRate.toFixed(1)} pts/hr
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="custom-progress-track" style={{ flex: 1 }}>
            <div className="custom-progress-fill" style={{ width: `${miningPowerPct}%` }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{miningPowerPct}%</span>
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
              Today's Earnings
            </div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              +{rewardTotal.toFixed(2)} Coopoints
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
