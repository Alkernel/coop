import React, { useState } from 'react';
import { ChevronLeft, Zap, Lock, Clock, Check } from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';

const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const PriceBoostScreen: React.FC = () => {
  const { goBack, settings, miningStatus, purchaseBoost } = useWallet();
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [doneTier, setDoneTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tiers = settings?.boostTiers ?? [];
  const currentBoost = miningStatus?.boostPct ?? 0;
  const purchasesEnabled = settings?.boostPurchasesEnabled ?? false;

  const handleBuy = async (tierId: string) => {
    setError(null);
    setBusyTier(tierId);
    try {
      await purchaseBoost(tierId);
      setDoneTier(tierId);
    } catch (err: any) {
      setError(err?.message || 'Purchase failed');
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="boost-back-btn">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Boost Your Mining</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Top Boost Emblem & Stat */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '16px 0 20px 0', textAlign: 'center'
      }}>
        <div style={{ marginBottom: 16 }}>
          <CoopLogo size={64} glow />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Current Boost
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.5px', margin: '4px 0 6px 0' }}>
          +{fmt(currentBoost)}%
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 260, lineHeight: 1.4 }}>
          Boosts increase your mining rate, up to {fmt(settings?.dailyMiningHours ?? 12)} mining hours per day. The daily Coopoints limit still applies.
        </p>
      </div>

      {/* Boost Tiers — purchase is NOT live yet */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tiers.map(tier => (
          <div key={tier.id} className="bubble-card" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--bg-glass-active)',
                  border: '1px solid var(--border-color)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Zap size={18} color="var(--accent-green)" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{tier.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      background: 'var(--bg-glass)', color: 'var(--text-secondary)',
                      padding: '2px 6px', borderRadius: 6
                    }}>
                      {tier.durationDays} DAYS
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>
                    +{fmt(tier.boostPct)}% mining speed
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>${tier.priceUsd.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>USDT</div>
              </div>
            </div>

            {purchasesEnabled ? (
              <button
                className="pill-btn pill-btn-primary"
                disabled={busyTier !== null || doneTier === tier.id}
                onClick={() => handleBuy(tier.id)}
                id={`boost-buy-${tier.id}`}
                style={{
                  width: '100%', marginTop: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                {doneTier === tier.id ? <Check size={14} /> : <Zap size={14} />}
                {doneTier === tier.id ? 'Boost Active' : busyTier === tier.id ? 'Processing...' : 'Buy with USDT'}
              </button>
            ) : (
              <button
                className="pill-btn pill-btn-secondary"
                disabled
                id={`boost-coming-soon-${tier.id}`}
                style={{
                  width: '100%', marginTop: 12, opacity: 0.7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                <Lock size={14} />
                COMING SOON
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Honest disclosure */}
      <div className="bubble-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Clock size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            USDT boost purchases are not live yet — payment will be enabled in a future
            release. Boosts never bypass the daily 12-hour mining limit.
          </p>
        </div>
      </div>
    </div>
  );
};

﻿
