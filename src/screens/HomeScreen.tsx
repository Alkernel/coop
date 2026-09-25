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
    isMiningActive,
    setSelectedAsset,
    settings,
    market
  } = useWallet();

  const [showNotifications, setShowNotifications] = useState(false);

  // Balances are real Supabase values. No invented USD price: USD is only
  // estimated while explicitly labeled, using no hardcoded market price.
  const coopBalance = account?.coopBalance || 0;
  const cooptokenBalance = account?.cooptokenBalance || 0;

  // --- Real cross-values -----------------------------------------------------
  // COOP is priced in USDT from the admin-published reference price
  // (admin_settings.coop_price_usd). Until an admin sets it, priceSet is false
  // and the UI says "not published yet" rather than inventing a market value.
  const coopPriceUsd = market?.priceSet ? market.coopPriceUsd : 0;
  const coopUsdValue = coopPriceUsd > 0 ? coopBalance * coopPriceUsd : null;

  // Coopoint is valued in COOP through the REAL swap ratio (points_per_coop) —
  // exactly the rate the server uses when converting, so the number matches
  // what the user actually gets in Swap.
  const pointsPerCoop = (settings?.pointsPerCoop && settings.pointsPerCoop > 0)
    ? settings.pointsPerCoop
    : (market?.pointsPerCoop && market.pointsPerCoop > 0 ? market.pointsPerCoop : 0);
  const cooptokenInCoop = pointsPerCoop > 0 ? cooptokenBalance / pointsPerCoop : null;
  const cooptokenUsdValue = cooptokenInCoop != null && coopPriceUsd > 0
    ? cooptokenInCoop * coopPriceUsd
    : null;

  // Share of circulating supply — real holder data from the ledger.
  const circulatingSupply = market?.circulatingSupply ?? 0;
  const holderSharePct = circulatingSupply > 0 ? (coopBalance / circulatingSupply) * 100 : null;

  // Real values from the backend mining status
  const boostPct = miningStatus?.boostPct ?? 0;
  const effectiveRate = (miningStatus?.rate ?? 50) * (1 + boostPct / 100);
  const hoursToday = miningStatus?.hoursMinedToday ?? 0;
  const dailyHours = miningStatus?.dailyHours ?? 12;
  const miningPowerPct = Math.min(100, Math.round((hoursToday / dailyHours) * 100));

  // Today's mining earnings (server-side value, COOP Token units)
  const rewardTotal = miningStatus?.pointsEarnedToday ?? 0;

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

      {/* Account restriction notice (set by admin) */}
      {account?.status && account.status !== 'active' && (
        <div style={{
          background: 'var(--accent-red)',
          color: '#fff',
          borderRadius: 14,
          padding: '12px 14px',
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.45
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>
            {account.status === 'restricted' && 'Account restricted'}
            {account.status === 'suspended' && 'Account suspended'}
            {account.status === 'banned' && 'Account banned'}
          </div>
          <div style={{ opacity: 0.92 }}>
            {account.status === 'restricted'
              ? 'You can view your balances, but sending, swapping, tasks and mining are disabled.'
              : 'This account has been locked by an administrator.'}
            {account.restrictedReason ? ` Reason: ${account.restrictedReason}` : ''}
          </div>
        </div>
      )}

      {/* Total Balance Card */}
      <div className="bubble-card bubble-card-elevated" style={{ background: 'var(--bg-surface)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>COOP Balance</span>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.5px', margin: '6px 0 2px 0' }}>
          {coopBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COOP
        </div>
        {/* Real USDT value. Shown only when an admin has published the COOP
            reference price — never a hardcoded or invented market value. */}
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 10 }}>
          {coopUsdValue != null
            ? `≈ $${coopUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
            : 'USDT value not published yet'}
          {coopPriceUsd > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>
              {` · 1 COOP = $${coopPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`}
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            <span>{coopBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COOP</span>
            {/* Share of circulating COOP supply — real holder data. Until the
                holder index is available, the mining boost badge is kept. */}
            {holderSharePct != null ? (
              <span className="badge-tag badge-green">
                {holderSharePct < 0.01 ? '<0.01' : holderSharePct.toFixed(2)}% of supply
              </span>
            ) : (
              <span className="badge-tag badge-green">
                ▲ +{boostPct}%
              </span>
            )}
            {market != null && market.holderCount > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {market.holderCount.toLocaleString('en-US')} holders
              </span>
            )}
          </div>

          <div style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            background: 'var(--bg-glass)',
            padding: '3px 8px',
            borderRadius: 8,
            border: '1px solid var(--border-color)'
          }}>
            {cooptokenBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} Coopoint (Mining)
            {cooptokenInCoop != null && (
              <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>
                ≈ {cooptokenInCoop.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} COOP
              </span>
            )}
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
            symbol: 'COOP',
            network: 'Internal ledger · transferable',
            balance: coopBalance,
            soon: false,
            canSend: true,
            canReceive: true,
            canSwap: true
          },
          {
            coin: 'COOPTOKEN' as const,
            name: 'Coopoint',
            symbol: 'Coopoint',
            network: 'Mining rewards · swap to Coopcoin',
            balance: cooptokenBalance,
            soon: false,
            canSend: false,
            canReceive: false,
            canSwap: true
          },
          {
            coin: 'USDT' as const,
            name: 'USDT',
            symbol: 'USDT',
            network: 'BEP-20 · Buy Boost & Miners',
            balance: null as number | null,
            soon: true,
            canSend: false,
            canReceive: false,
            canSwap: false
          }
        ].map(asset => (
          <div
            key={asset.coin}
            className="bubble-card"
            onClick={() => {
              if (!asset.soon) {
                setSelectedAsset(asset.coin as 'COOP' | 'COOPTOKEN');
                navigateTo('asset_detail');
              }
            }}
            style={{
              padding: '12px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: asset.soon ? 'default' : 'pointer',
              opacity: asset.soon ? 0.7 : 1
            }}
          >
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
                {asset.balance == null
                  ? '—'
                  : asset.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {asset.balance == null ? 'Not tracked on-chain yet' : asset.symbol}
              </div>
              {/* Real cross-value: Coopcoin → USDT (admin-published price),
                  Coopoint → COOP (the real swap ratio the server converts at). */}
              {asset.coin === 'COOP' && coopUsdValue != null && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  ≈ ${coopUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
              {asset.coin === 'COOPTOKEN' && cooptokenInCoop != null && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  ≈ {cooptokenInCoop.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} COOP
                  {cooptokenUsdValue != null && (
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>
                      {` · $${cooptokenUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  )}
                </div>
              )}
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
              +{rewardTotal.toFixed(2)} Coopoint
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
