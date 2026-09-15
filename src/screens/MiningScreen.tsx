import React, { useState } from 'react';
import { ChevronLeft, Zap, ChevronRight, CheckCircle2, Clock, Ban, TimerReset, Coins } from 'lucide-react';
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
    claimMining,
    addNotification
  } = useWallet();
  const [busy, setBusy] = useState(false);
  const [mineError, setMineError] = useState('');
  const status = miningStatus;
  const rate = status?.rate ?? 0;
  const boostPct = status?.boostPct ?? 0;
  const effectiveRate = rate * (1 + boostPct / 100);
  const hoursToday = status?.hoursMinedToday ?? 0;
  const pointsToday = status?.pointsEarnedToday ?? 0;
  const dailyHours = status?.dailyHours ?? 12;
  const session = miningStatus?.session ?? null;
  // A session whose server countdown has finished but has not been claimed yet.
  const hasPendingClaim = Boolean(session && session.status === 'mining' && miningRemainingMs <= 0);
  const sessionReward = hasPendingClaim && session
    ? Math.max(0, ((session.endTime - session.startTime) / 3600000) * (session.baseRate ?? rate) * (1 + boostPct / 100))
    : 0;

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

  const handleStart = async () => {
    setBusy(true);
    setMineError('');
    try {
      await startMining();
    } catch (err: any) {
      const msg = err?.message || 'Could not start mining. Please try again.';
      setMineError(msg);
      addNotification('Mining Error', msg, 'info');
    } finally {
      setBusy(false);
    }
  };

  const handleClaim = async () => {
    setBusy(true);
    setMineError('');
    try {
      let reward: number;
      try {
        reward = await claimMining();
      } catch (err: any) {
        // The on-screen countdown runs on the DEVICE clock while the server is
        // authoritative, so a device clock running fast can offer "Claim"
        // slightly before the server accepts it. Wait for the server's own
        // clock and retry exactly once instead of showing a hard failure.
        if (/countdown is not finished/i.test(String(err?.message || ''))) {
          await new Promise(resolve => window.setTimeout(resolve, 2500));
          reward = await claimMining();
        } else {
          throw err;
        }
      }
      if (reward > 0) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      }
    } catch (err: any) {
      const msg = err?.message || 'Could not claim your mining reward. Please try again.';
      setMineError(msg);
      addNotification('Mining Error', msg, 'info');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Mining</span>
        <div style={{ width: 40 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0 20px 0' }}>
        <div className="mining-radar-circle">
          <div className="mining-radar-inner">
            <CoopLogo size={68} glow animated={isMiningActive} />
          </div>
        </div>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 6 }}>
            {hasPendingClaim ? 'Session Complete' : isMiningActive ? 'You are mining!' : dailyLimitReached ? 'Daily Limit Reached' : 'Mining Paused'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {fmt(effectiveRate, 1)} Point/hour
            {boostPct > 0 && <span style={{ color: 'var(--accent-green)' }}> (base {fmt(rate)} + boost +{fmt(boostPct)}%)</span>}
          </p>
          {isMiningActive && miningRemainingMs > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'var(--bg-glass-active)', padding: '6px 14px', borderRadius: 9999, border: '1px solid var(--border-color)', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              <Clock size={14} />
              <span>{formatTime(miningRemainingMs)}</span>
            </div>
          )}
          {hasPendingClaim && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'rgba(34, 197, 94, 0.12)', padding: '6px 14px', borderRadius: 9999, border: '1px solid var(--accent-green)', fontSize: 13, fontWeight: 700, color: 'var(--accent-green)' }}>
              <CheckCircle2 size={14} />
              <span>Session complete — ready to claim</span>
            </div>
          )}
        </div>
        <div style={{ width: '100%', marginTop: 20 }}>
          {/* Order matters: a finished-but-unclaimed session (and the live
              countdown) must never be hidden behind the daily-limit message,
              otherwise the Claim button can become unreachable. */}
          {hasPendingClaim ? (
            <button className="pill-btn pill-btn-primary" onClick={handleClaim} disabled={busy} id="mining-claim-btn" style={{ background: 'var(--accent-green)', color: '#ffffff' }}>
              <CheckCircle2 size={18} />
              {busy ? 'Claiming...' : 'Claim ' + fmt(sessionReward) + ' Point'}
            </button>
          ) : isMiningActive ? (
            <button className="pill-btn pill-btn-primary" disabled style={{ opacity: 0.65 }} id="mining-countdown-btn">
              <Clock size={18} />
              Claim in {formatTime(miningRemainingMs)}
            </button>
          ) : dailyLimitReached || (status && !status.miningEnabled) ? (
            <button className="pill-btn pill-btn-primary" disabled style={{ opacity: 0.6 }} id="mining-blocked-btn">
              <Ban size={18} />
              {status && !status.miningEnabled ? 'Mining is currently disabled' : 'Daily limit reached - resets ' + (status ? formatReset(status.nextResetUtc) : 'at 00:00 UTC')}
            </button>
          ) : (
            <button className="pill-btn pill-btn-primary" onClick={handleStart} disabled={busy} id="mining-start-btn">
              <Zap size={18} />
              {busy ? 'Starting...' : 'START MINING'}
            </button>
          )}
        </div>
        {mineError && (
          <div style={{
            width: '100%', marginTop: 12, padding: '10px 14px', borderRadius: 14,
            background: 'rgba(239, 68, 68, 0.08)', border: '1px solid var(--accent-red, #ef4444)',
            fontSize: 12.5, fontWeight: 600, color: 'var(--accent-red, #ef4444)', textAlign: 'center'
          }}>
            {mineError}
          </div>
        )}
      </div>
      <div className="bubble-card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Today's Mining</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{hoursToday.toFixed(2)} / {dailyHours} hours</span>
        </div>
        <div className="custom-progress-track">
          <div className="custom-progress-fill" style={{ width: Math.min(100, (hoursToday / dailyHours) * 100) + '%' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Today's Earnings</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-green)' }}>+{fmt(pointsToday)} Point</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Daily Limit</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(status?.dailyLimitPoints ?? dailyHours * rate)} Point</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
            <TimerReset size={14} /> Next Reset
          </span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{status ? formatReset(status.nextResetUtc) : '00:00 UTC'}</span>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '4px 0 10px 0', color: 'var(--text-secondary)' }}>Boost Your Mining</div>
      <button className="pill-btn pill-btn-primary" onClick={() => navigateTo('price_boost')} style={{ marginBottom: 16 }} id="mining-boost-btn">
        <Zap size={18} />
        Current Boost: +{fmt(boostPct)}% - Get More
      </button>
      <div className="bubble-card" onClick={() => navigateTo('swap')} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-glass-active)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Coins size={20} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 2 }}>Point Balance</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{fmt(miningStatus?.wallet.cooptokenBalance ?? 0)} Point</div>
          </div>
        </div>
        <ChevronRight size={16} color="var(--text-tertiary)" />
      </div>
    </div>
  );
};