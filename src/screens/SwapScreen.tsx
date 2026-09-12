import React, { useState } from 'react';
import { ChevronLeft, Check, AlertCircle, Info, ArrowLeftRight } from 'lucide-react';
import { CoinIcon } from '../components/CoinIcon';
import { useWallet } from '../context/WalletContext';
import confetti from 'canvas-confetti';
import { SwapDirection } from '../types';

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });

export const SwapScreen: React.FC = () => {
  const { goBack, account, executeSwap, settings } = useWallet();
  // Asset rule: Cooptoken -> COOP (Coopcoin). Bidirectional swap supported.
  const [direction, setDirection] = useState<SwapDirection>('points_to_coop');
  const [fromAmount, setFromAmount] = useState<string>('1000');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Swap ratio always comes from Supabase admin settings (no hardcoded ratio).
  const pointsPerCoop = settings?.pointsPerCoop ?? 0;
  const settingsLoaded = settings != null && pointsPerCoop > 0;
  const pointsBalance = account?.cooptokenBalance || 0;
  const coopBalance = account?.coopBalance || 0;

  const isPointsToCoop = direction === 'points_to_coop';
  const fromCoin = isPointsToCoop ? 'COOPTOKEN' as const : 'COOP' as const;
  const toCoin = isPointsToCoop ? 'COOP' as const : 'COOPTOKEN' as const;
  const fromName = isPointsToCoop ? 'Coopoint' : 'Coopcoin';
  const toName = isPointsToCoop ? 'Coopcoin' : 'Coopoint';
  const fromBalance = isPointsToCoop ? pointsBalance : coopBalance;
  const toBalance = isPointsToCoop ? coopBalance : pointsBalance;

  const numAmount = parseFloat(fromAmount) || 0;
  const toNum = isPointsToCoop
    ? (settingsLoaded ? numAmount / pointsPerCoop : 0)
    : (settingsLoaded ? numAmount * pointsPerCoop : 0);
  const toAmount = settingsLoaded ? toNum.toFixed(isPointsToCoop ? 4 : 0) : '—';
  const insufficient = numAmount > fromBalance;

  const toggleDirection = () => {
    setDirection(d => d === 'points_to_coop' ? 'coop_to_points' : 'points_to_coop');
    setFromAmount('');
    setError('');
    setSuccessMsg('');
  };

  const handleSwapClick = () => {
    setError('');
    setSuccessMsg('');
    if (!settingsLoaded) { setError('Swap rate is loading from the server. Please wait.'); return; }
    if (numAmount <= 0) { setError('Enter an amount to convert.'); return; }
    if (insufficient) {
      setError(`Insufficient ${fromName} balance.`);
      return;
    }
    setShowConfirm(true);
  };

  const confirmSwap = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await executeSwap(direction, numAmount);
      setShowConfirm(false);
      if (isPointsToCoop) {
        setSuccessMsg(`Converted ${fmt(res.points, 0)} Cooptoken → ${res.coop} COOP. ID ${res.txHash}.`);
      } else {
        setSuccessMsg(`Converted ${fmt(res.coop, 0)} COOP → ${res.points} Cooptoken. ID ${res.txHash}.`);
      }
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
      setFromAmount('');
    } catch (err: any) {
      setError(err.message || 'Swap failed');
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-content" style={{ minHeight: '100%', justifyContent: 'space-between' }}>
      <div>
        <div className="screen-header">
          <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="swap-back-btn">
            <ChevronLeft size={22} />
          </button>
          <span className="screen-header-title">Swap</span>
          <div style={{ width: 40 }} />
        </div>

        {/* From Card */}
        <div className="bubble-card bubble-card-elevated" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>From</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Balance: {fmt(fromBalance)} {isPointsToCoop ? 'Cooptoken' : 'COOP'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CoinIcon coin={fromCoin} size={38} />
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{fromName}</span>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {isPointsToCoop ? 'Mining reward asset' : 'Transferable asset'}
                </div>
              </div>
            </div>
            <input
              type="number" min="0" value={fromAmount}
              onChange={e => { setFromAmount(e.target.value); setError(''); }}
              placeholder="0" id="swap-from-input"
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: 20, fontWeight: 800,
                textAlign: 'right', width: 110, fontFamily: 'var(--font-mono)'
              }}
            />
          </div>
        </div>

        {/* Swap Direction Toggle (center) */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '-8px 0', zIndex: 2, position: 'relative' }}>
          <button
            onClick={toggleDirection}
            style={{
              background: 'var(--bg-glass-active)', border: '1px solid var(--border-color)',
              borderRadius: '50%', width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-primary)'
            }}
            aria-label="Swap direction"
          >
            <ArrowLeftRight size={18} />
          </button>
        </div>

        {/* To Card */}
        <div className="bubble-card bubble-card-elevated" style={{ marginTop: -8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>To</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Balance: {fmt(toBalance)} {isPointsToCoop ? 'COOP' : 'Cooptoken'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CoinIcon coin={toCoin} size={38} />
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{toName}</span>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {isPointsToCoop ? 'Transferable asset' : 'Mining reward asset'}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{toAmount}</span>
          </div>
        </div>

        {/* Rate + Confirmation preview (ratio from Supabase settings) */}
        <div className="bubble-card" style={{ marginTop: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Rate</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {settingsLoaded
                ? `${fmt(pointsPerCoop, 0)} Cooptoken = 1 COOP`
                : 'Loading rate from server…'}
            </span>
          </div>
          {numAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Estimated</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-green)' }}>
                {isPointsToCoop
                  ? `${fmt(numAmount, 0)} Cooptoken → ${toAmount} COOP`
                  : `${fmt(numAmount, 0)} COOP → ${toAmount} Cooptoken`}
              </span>
            </div>
          )}
          {settings && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {isPointsToCoop ? 'Remaining Reward Pool' : 'Cooptoken Balance Impact'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {isPointsToCoop
                  ? `${fmt(settings.remainingCoopRewardPool)} COOP`
                  : `+${fmt(toNum, 0)} Cooptoken`}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)',
            fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            padding: '10px 14px', borderRadius: 12,
            background: 'var(--accent-green-bg)', color: 'var(--accent-green)',
            fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
          }}>
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {settings && !settings.conversionEnabled && (
          <div style={{
            padding: '10px 14px', borderRadius: 12,
            background: 'var(--bg-glass)', color: 'var(--text-secondary)',
            fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
          }}>
            <Info size={16} />
            <span>Conversion is temporarily disabled by the COOP team.</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div style={{ paddingTop: 20 }}>
        <button className="pill-btn pill-btn-primary" onClick={handleSwapClick} id="btn-execute-swap">
          Review Swap
        </button>
      </div>

      {/* Confirmation Bottom Drawer */}
      {showConfirm && (
        <div className="drawer-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="drawer-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>Confirm Swap</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
                {isPointsToCoop
                  ? <>You are converting {fmt(numAmount, 0)} Cooptoken → <span style={{ color: 'var(--accent-green)' }}>{toAmount} COOP</span></>
                  : <>You are converting {fmt(numAmount, 0)} COOP → <span style={{ color: 'var(--accent-green)' }}>{toAmount} Cooptoken</span></>
                }
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Exchange Rate:</span>
                <span style={{ fontWeight: 600 }}>
                  {settingsLoaded ? `${fmt(pointsPerCoop, 0)} Cooptoken = 1 COOP` : 'Loading…'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Network Fee:</span>
                <span style={{ fontWeight: 600 }}>0.00 (internal)</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="pill-btn pill-btn-secondary" onClick={() => setShowConfirm(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                className="pill-btn pill-btn-primary" onClick={confirmSwap} disabled={loading}
                style={{ flex: 1 }} id="btn-confirm-swap"
              >
                {loading ? 'Swapping...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

