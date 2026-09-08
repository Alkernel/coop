import React, { useState } from 'react';
import { ChevronLeft, ArrowDownUp, Check, AlertCircle } from 'lucide-react';
import { CoinIcon } from '../components/CoinIcon';
import { useWallet } from '../context/WalletContext';
import confetti from 'canvas-confetti';

export const SwapScreen: React.FC = () => {
  const { goBack, account, executeSwap } = useWallet();
  const [fromAmount, setFromAmount] = useState<string>('1000');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const numAmount = parseFloat(fromAmount) || 0;
  // Exact rule: 1,000 Cooptoken = 1.000 COOP
  const toAmount = (numAmount / 1000).toFixed(4);
  const availableCooptoken = account?.cooptokenBalance || 0;

  const handleSwapClick = () => {
    setError('');
    setSuccessMsg('');
    if (numAmount < 1000) {
      setError('Minimum swap amount is 1,000 Cooptoken.');
      return;
    }
    if (numAmount > availableCooptoken) {
      setError('Insufficient Cooptoken balance.');
      return;
    }
    setShowConfirm(true);
  };

  const confirmSwap = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await executeSwap(numAmount);
      setShowConfirm(false);
      setSuccessMsg(`Swapped ${numAmount} Cooptoken for ${res.coopReceived} COOP!`);
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 }
      });
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
        {/* Header */}
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
              Balance: {availableCooptoken.toLocaleString()} Cooptoken
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CoinIcon coin="COOPTOKEN" size={38} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>Cooptoken</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Mining Coin · BEP-20</div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <input
                type="number"
                value={fromAmount}
                onChange={e => {
                  setFromAmount(e.target.value);
                  setError('');
                }}
                placeholder="0"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 24,
                  fontWeight: 800,
                  textAlign: 'right',
                  color: 'var(--text-primary)',
                  width: 140,
                  fontFamily: 'inherit'
                }}
                id="input-swap-amount"
              />
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                ≈ ${(numAmount * 0.000199).toFixed(3)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              type="button"
              onClick={() => setFromAmount('1000')}
              style={{
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              Min (1K)
            </button>
            <button
              type="button"
              onClick={() => setFromAmount(availableCooptoken.toString())}
              style={{
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              MAX
            </button>
          </div>
        </div>

        {/* Swap Flip Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '-6px 0' }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 2
          }}>
            <ArrowDownUp size={18} />
          </div>
        </div>

        {/* To Card */}
        <div className="bubble-card bubble-card-elevated">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>To</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Balance: {account?.coopBalance.toLocaleString()} COOP
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CoinIcon coin="COOP" size={38} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>COOP</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Mainnet Wallet · BEP-20</div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {toAmount}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                ≈ ${(parseFloat(toAmount) * 0.199).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Rate details */}
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-glass)',
          borderRadius: 16,
          border: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          color: 'var(--text-secondary)',
          margin: '16px 0'
        }}>
          <div>
            <span>Rate (Fixed)</span>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              1,000 Cooptoken = 1 COOP
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span>Network Fee</span>
            <div style={{ fontWeight: 700, color: 'var(--accent-green)', marginTop: 2 }}>
              0.00 COOP
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--accent-red)',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: 'var(--accent-green-bg)',
            color: 'var(--accent-green)',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div style={{ paddingTop: 20 }}>
        <button
          className="pill-btn pill-btn-primary"
          onClick={handleSwapClick}
          id="btn-execute-swap"
        >
          Swap
        </button>
      </div>

      {/* Confirmation Bottom Drawer */}
      {showConfirm && (
        <div className="drawer-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="drawer-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>Confirm Swap</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>You Pay:</span>
                <span style={{ fontWeight: 700 }}>{numAmount} Cooptoken</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>You Receive:</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>+{toAmount} COOP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Exchange Rate:</span>
                <span style={{ fontWeight: 600 }}>1,000 : 1</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="pill-btn pill-btn-secondary" 
                onClick={() => setShowConfirm(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                className="pill-btn pill-btn-primary" 
                onClick={confirmSwap}
                disabled={loading}
                style={{ flex: 1 }}
                id="btn-confirm-swap"
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
