import React, { useState } from 'react';
import { ChevronLeft, Zap, Sparkles, ChevronRight, CheckCircle2, Clock, Ban, TimerReset } from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';
import confetti from 'canvas-confetti';

const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const MiningScreen: React.FC = () => {
  const {
    goBack,
    navigateTo,
    miningStatus,
    miningRemainingMs,
    isMiningActive,
    dailyLimitReached,
    startMining,
    stopMining
  } = useWallet();

  const [busy, setBusy] = useState(false);

  const status = miningStatus;
  const rate = status?.rate ?? 50;
  const boostPct = status?.boostPct ?? 0;
  const effectiveRate = rate * (1 + boostPct / 100);
  const hoursToday = status?.hoursMinedToday ?? 0;
  const pointsToday = status?.pointsEarnedToday ?? 0;
  const dailyHours = status?.dailyHours ?? 12;

  const formatTime = (ms: number) => {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const formatReset = (ms: number) => {
    const d = new Date(ms);
    return d.toISOString().slice(11, 16) + ' UTC';
  };

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (isMiningActive) {
        const reward = await stopMining();
        if (reward > 0) {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        }
      } else {
        await startMining();
      }
    } catch {
      /* errors surface via notifications */
    } finally {
      setBusy(false);
    }
  };

  const unclaimedEstimate = isMiningActive
    ? Math.min(miningRemainingMs / 3600000, Math.max(0, dailyHours - hoursToday)) * effectiveRate
    : 0;

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
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '24px 0 20px 0'
      }}>
        <div className="mining-radar-circle">
          <div className="mining-radar-inner">
            <CoopLogo size={68} glow animated={isMiningActive} />
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 6 }}>
            {dailyLimitReached ? 'Daily Limit Reached' : isMiningActive ? 'You are mining!' : 'Mining Paused'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {fmt(effectiveRate, 1)} Cooptoken / hour
            {boostPct > 0 && (
              <span style={{ color: 'var(--accent-green)' }}> (base {fmt(rate)} + boost +{fmt(boostPct)}%)</span>
            )}
          </p>

          {isMiningActive && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 10, background: 'var(--bg-glass-active)',
              padding: '6px 14px', borderRadius: 9999,
              border: '1px solid var(--border-color)',
              fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600
            }}>
              <Clock size={14} />
              <span>{formatTime(miningRemainingMs)}</span>
            </div>
          )}
        </div>

        <div style={{ width: '100%', marginTop: 20 }}>
          {dailyLimitReached || (status && !status.miningEnabled) ? (
            <button className="pill-btn pill-btn-primary" disabled style={{ opacity: 0.6 }}>
              <Ban size={18} />
              {status && !status.miningEnabled
                ? 'Mining is currently disabled'
                : `Daily limit reached — resets ${status ? formatReset(status.nextResetUtc) : 'at 00:00 UTC'}`}
            </button>
          ) : isMiningActive ? (
            <button
              className="pill-btn pill-btn-primary"
              onClick={handleToggle}
              disabled={busy}
              id="mining-stop-btn"
              style={{ background: 'var(--accent-green)', color: '#ffffff' }}
            >
              <CheckCircle2 size={18} />
              {busy ? 'Stopping...' : `Stop & Claim ≈ ${fmt(unclaimedEstimate)} Cooptoken`}
            </button>
          ) : (
            <button className="pill-btn pill-btn-primary" onClick={handleToggle} disabled={busy} id="mining-start-btn">
              <Zap size={18} />
              {busy ? 'Starting...' : 'START MINING'}
            </button>
          )}
        </div>
      </div>

﻿

      {/* Today's Mining Stats */}
      <div className="bubble-card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Today's Mining</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {hoursToday.toFixed(2)} / {dailyHours} hours
          </span>
        </div>
        <div className="custom-progress-track">
          <div className="custom-progress-fill" style={{ width: `${Math.min(100, (hoursToday / dailyHours) * 100)}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Today's Earnings</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-green)' }}>
            +{fmt(pointsToday)} Cooptoken
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Daily Limit</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {fmt(status?.dailyLimitPoints ?? dailyHours * rate)} Cooptoken
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
            <TimerReset size={14} /> Next Reset
          </span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {status ? formatReset(status.nextResetUtc) : '00:00 UTC'}
          </span>
        </div>
      </div>

      {/* Boost Your Mining */}
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '4px 0 10px 0', color: 'var(--text-secondary)' }}>
        Boost Your Mining
      </div>
      <button
        className="pill-btn pill-btn-primary"
        onClick={() => navigateTo('price_boost')}
        style={{ marginBottom: 16 }}
        id="mining-boost-btn"
      >
        <Zap size={18} />
        Current Boost: +{fmt(boostPct)}% — Get More
      </button>

      {/* Balance Card */}
      <div
        className="bubble-card"
        onClick={() => navigateTo('swap')}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--bg-glass-active)',
            border: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 2 }}>
              Coopoint Balance
            </div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              {fmt(miningStatus?.wallet.cooptokenBalance ?? 0)} Cooptoken
            </div>
          </div>
        </div>
        <ChevronRight size={16} color="var(--text-tertiary)" />
      </div>
    </div>
  );
};

