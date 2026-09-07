import React, { useState } from 'react';
import { ChevronLeft, Zap, Sparkles, Check, ChevronRight } from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';
import { BOOST_TIERS } from '../services/supabase';
import { BoostTier } from '../types';
import confetti from 'canvas-confetti';

export const PriceBoostScreen: React.FC = () => {
  const { goBack, account, purchaseBoost } = useWallet();
  const [selectedTier, setSelectedTier] = useState<BoostTier | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const currentBoost = account?.currentBoostPct || 15;

  const handleConfirmPurchase = async () => {
    if (!selectedTier) return;
    setLoading(true);
    try {
      const ok = await purchaseBoost(selectedTier.id);
      if (ok) {
        setSuccess(`Successfully activated ${selectedTier.name}! (+${selectedTier.rewardBonus} mining reward)`);
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 }
        });
        setSelectedTier(null);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="boost-back-btn">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Price Boost</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Top Boost Emblem & Stat */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0 20px 0',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: 16 }}>
          <CoopLogo size={64} glow />
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Current Boost
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.5px', margin: '4px 0 6px 0' }}>
          +{currentBoost}%
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 220, lineHeight: 1.4 }}>
          The more you mine, the higher your boost.
        </p>

        {/* Boost Progress Card */}
        <div className="bubble-card" style={{ width: '100%', marginTop: 18, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            <span>Boost Progress</span>
            <span>60%</span>
          </div>
          <div className="custom-progress-track">
            <div className="custom-progress-fill" style={{ width: '60%' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Mine 40K more to reach +25% base rate
          </div>
        </div>
      </div>

      {success && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 14,
          background: 'var(--accent-green-bg)',
          color: 'var(--accent-green)',
          fontSize: 13,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Available Boost Purchases Heading */}
      <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
        Available Boost Upgrades
      </h3>

      {/* Boost Tiers List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {BOOST_TIERS.map(tier => (
          <div
            key={tier.id}
            className="bubble-card"
            style={{
              padding: '14px 16px',
              marginBottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              border: tier.popular ? '1.5px solid var(--accent-green)' : '1px solid var(--border-color)',
              position: 'relative'
            }}
            onClick={() => setSelectedTier(tier)}
            id={`boost-tier-${tier.id}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: 'var(--bg-glass-active)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-yellow)'
              }}>
                <Zap size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{tier.name}</span>
                  {tier.popular && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: 'var(--accent-green)',
                      color: '#ffffff',
                      padding: '2px 6px',
                      borderRadius: 6
                    }}>
                      POPULAR
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>
                  +{tier.rewardBonus} mining reward (+{tier.boostPct}%)
                </div>
              </div>
            </div>

            <div style={{
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              padding: '6px 14px',
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 800
            }}>
              ${tier.costUsd.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Purchase Confirmation Sheet */}
      {selectedTier && (
        <div className="drawer-backdrop" onClick={() => setSelectedTier(null)}>
          <div className="drawer-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14, textAlign: 'center' }}>
              Confirm Boost Purchase
            </h3>

            <div style={{
              background: 'var(--bg-surface)',
              borderRadius: 18,
              padding: 16,
              border: '1px solid var(--border-color)',
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tier Name:</span>
                <span style={{ fontWeight: 700 }}>{selectedTier.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Mining Reward:</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>+{selectedTier.rewardBonus} Cooptoken</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
                <span>Price:</span>
                <span>${selectedTier.costUsd.toFixed(2)} USD</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="pill-btn pill-btn-secondary"
                onClick={() => setSelectedTier(null)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                className="pill-btn pill-btn-primary"
                onClick={handleConfirmPurchase}
                disabled={loading}
                style={{ flex: 1 }}
                id="btn-confirm-purchase-boost"
              >
                {loading ? 'Activating...' : 'Confirm & Pay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
