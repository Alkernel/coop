import React, { useState } from 'react';
import { ChevronLeft, Zap, Sparkles, ChevronRight, CheckCircle2, Clock } from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';
import confetti from 'canvas-confetti';

export const MiningScreen: React.FC = () => {
  const { 
    goBack, 
    navigateTo, 
    account, 
    miningSession, 
    miningRemainingMs, 
    isMiningActive, 
    canClaimMining, 
    startMining, 
    claimMining 
  } = useWallet();

  const [claiming, setClaiming] = useState(false);

  // Format countdown HH:MM:SS
  const formatTime = (ms: number) => {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    return `${hours}:${mins}:${secs}`;
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const reward = await claimMining();
      if (reward > 0) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    } finally {
      setClaiming(false);
    }
  };

  const currentReward = miningSession?.totalReward || (50 + (account?.totalBoostReward || 0));
  const ratePerHour = (currentReward / 12).toFixed(2);

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Mining</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Center Animated Radar Stage */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 0 20px 0'
      }}>
        <div className="mining-radar-circle">
          <div className="mining-radar-inner">
            <CoopLogo size={68} glow animated={isMiningActive} />
          </div>
        </div>

        {/* Mining Status Text */}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 6 }}>
            {canClaimMining ? 'Reward Ready!' : isMiningActive ? 'You are mining!' : 'Mining Paused'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {ratePerHour} Cooptoken / hour
          </p>

          {/* Countdown timer pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            background: 'var(--bg-glass-active)',
            padding: '6px 14px',
            borderRadius: 9999,
            border: '1px solid var(--border-color)',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600
          }}>
            <Clock size={14} />
            <span>{isMiningActive ? formatTime(miningRemainingMs) : '12:00:00 Cycle'}</span>
          </div>
        </div>

        {/* Claim or Start Action Button */}
        <div style={{ width: '100%', marginTop: 20 }}>
          {canClaimMining ? (
            <button 
              className="pill-btn pill-btn-primary"
              onClick={handleClaim}
              disabled={claiming}
              id="mining-claim-btn"
              style={{ background: 'var(--accent-green)', color: '#ffffff' }}
            >
              <CheckCircle2 size={18} />
              {claiming ? 'Claiming Reward...' : `Claim +${currentReward.toFixed(2)} Cooptoken`}
            </button>
          ) : !isMiningActive ? (
            <button 
              className="pill-btn pill-btn-primary"
              onClick={startMining}
              id="mining-start-btn"
            >
              <Zap size={18} />
              Start 12-Hour Mining Cycle
            </button>
          ) : null}
        </div>
      </div>

      {/* Mining Power Card */}
      <div className="bubble-card" style={{ marginBottom: 12 }}>
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

      {/* Boost Mining Button */}
      <button 
        className="pill-btn pill-btn-primary"
        onClick={() => navigateTo('price_boost')}
        style={{ marginBottom: 16 }}
        id="mining-boost-btn"
      >
        <Zap size={18} />
        Boost Mining
      </button>

      {/* Today's Reward Card */}
      <div 
        className="bubble-card" 
        onClick={() => navigateTo('price_boost')}
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
            justifyContent: 'center'
          }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 2 }}>
              Today's Reward
            </div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              +{currentReward.toFixed(2)} Cooptoken
            </div>
          </div>
        </div>

        <ChevronRight size={16} color="var(--text-tertiary)" />
      </div>
    </div>
  );
};
