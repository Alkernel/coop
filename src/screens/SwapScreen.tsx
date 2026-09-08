import React, { useState } from 'react';
import { ChevronLeft, ArrowDownUp, Check, AlertCircle, Info } from 'lucide-react';
import { CoinIcon } from '../components/CoinIcon';
import { useWallet } from '../context/WalletContext';
import confetti from 'canvas-confetti';
import { SwapDirection } from '../types';

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });

export const SwapScreen: React.FC = () => {
  const { goBack, account, executeSwap, settings } = useWallet();
  const [direction, setDirection] = useState<SwapDirection>('points_to_coop');
  const [fromAmount, setFromAmount] = useState<string>('1000');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const pointsPerCoop = settings?.pointsPerCoop ?? 10;
  const pointsToCoop = direction === 'points_to_coop';
  const pointsBalance = account?.cooptokenBalance || 0;
  const coopBalance = account?.coopBalance || 0;
  const fromBalance = pointsToCoop ? pointsBalance : coopBalance;
  const toBalance = pointsToCoop ? coopBalance : pointsBalance;

  const numAmount = parseFloat(fromAmount) || 0;
  // Fixed rate: 10 Coopoints = 1 COOP (1,000 Coopoints = 100 COOP)
  const pointsLeg = pointsToCoop ? numAmount : numAmount * pointsPerCoop;
  const coopLeg = pointsToCoop ? numAmount / pointsPerCoop : numAmount;
  const toAmount = pointsToCoop ? coopLeg.toFixed(4) : pointsLeg.toFixed(2);
  const insufficient = pointsToCoop ? numAmount > pointsBalance : numAmount > coopBalance;

  const handleSwapClick = () => {
    setError('');
    setSuccessMsg('');
    if (numAmount <= 0) { setError('Enter an amount to convert.'); return; }
    if (insufficient) {
      setError(pointsToCoop ? 'Insufficient Coopoints balance.' : 'Insufficient COOP balance.');
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
      setSuccessMsg(pointsToCoop
        ? `Converted ${fmt(res.points)} Coopoints into ${res.coop} COOP.`
        : `Converted ${fmt(res.coop)} COOP into ${fmt(res.points)} Coopoints.`);
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
      setFromAmount('');
    } catch (err: any) {
      setError(err.message || 'Swap failed');
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const flipDirection = () => {
    setDirection(prev => (prev === 'points_to_coop' ? 'coop_to_points' : 'points_to_coop'));
    setFromAmount('');
    setError('');
    setSuccessMsg('');
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
              Balance: {fmt(fromBalance)} {pointsToCoop ? 'Coopoints' : 'COOP'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CoinIcon coin={pointsToCoop ? 'COOPTOKEN' : 'COOP'} size={38} />
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{pointsToCoop ? 'Coopoints' : 'COOP'}</span>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {pointsToCoop ? 'Mining Reward Points' : 'COOP Token · BEP-20'}
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

        {/* Reverse Switch */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '-10px 0', zIndex: 2, position: 'relative' }}>
          <button
            onClick={flipDirection} id="btn-flip-swap" aria-label="Reverse swap direction"
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
              border: '3px solid var(--bg-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}
          >
            <ArrowDownUp size={18} />
          </button>
        </div>

        {/* To Card */}
        <div className="bubble-card bubble-card-elevated">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>To</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Balance: {fmt(toBalance)} {pointsToCoop ? 'COOP' : 'Coopoints'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CoinIcon coin={pointsToCoop ? 'COOP' : 'COOPTOKEN'} size={38} />
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{pointsToCoop ? 'COOP' : 'Coopoints'}</span>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {pointsToCoop ? 'COOP Token · BEP-20' : 'Mining Reward Points'}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{toAmount}</span>
          </div>
        </div>

        {/* Rate + Confirmation preview */}
        <div className="bubble-card" style={{ marginTop: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Rate</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {pointsToCoop ? '1,000 Coopoints = 100 COOP' : '100 COOP = 1,000 Coopoints'}
            </span>
          </div>
          {numAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Estimated</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-green)' }}>
                {pointsToCoop
                  ? `${fmt(pointsLeg)} Coopoints → ${toAmount} COOP`
                  : `${fmt(coopLeg)} COOP → ${toAmount} Coopoints`}
              </span>
            </div>
          )}
          {settings && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Remaining Reward Pool</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {fmt(settings.remainingCoopRewardPool)} COOP
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
                You are converting {fmt(numAmount)} {pointsToCoop ? 'Coopoints' : 'COOP'} into{' '}
                <span style={{ color: 'var(--accent-green)' }}>
                  {pointsToCoop ? `${toAmount} COOP` : `${toAmount} Coopoints`}
                </span>.
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Exchange Rate:</span>
                <span style={{ fontWeight: 600 }}>
                  {pointsToCoop ? '1,000 Coopoints = 100 COOP' : '100 COOP = 1,000 Coopoints'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Network Fee:</span>
                <span style={{ fontWeight: 600 }}>0.00 COOP</span>
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

