import React, { useState } from 'react';
import { ChevronLeft, QrCode, AlertCircle, Check } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import confetti from 'canvas-confetti';

export const SendScreen: React.FC = () => {
  const { goBack, account, executeSend } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [loading, setLoading] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const networkFee = 0.02;
  const total = numAmount > 0 ? numAmount + networkFee : 0;
  const availableCoop = account?.coopBalance || 0;

  const handleReview = () => {
    setError('');
    setSuccess('');
    if (!recipient.trim()) {
      setError('Please enter a recipient address or username.');
      return;
    }
    if (numAmount <= 0) {
      setError('Please enter an amount greater than 0.');
      return;
    }
    if (total > availableCoop) {
      setError('Insufficient COOP balance (including 0.02 network fee).');
      return;
    }
    setShowReview(true);
  };

  const confirmTransfer = async () => {
    setLoading(true);
    setError('');
    try {
      await executeSend(recipient.trim(), numAmount);
      setShowReview(false);
      setSuccess(`Successfully sent ${numAmount} COOP to ${recipient.slice(0, 10)}...!`);
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 }
      });
      setRecipient('');
      setAmount('');
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
      setShowReview(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-content" style={{ minHeight: '100%', justifyContent: 'space-between' }}>
      <div>
        {/* Header */}
        <div className="screen-header">
          <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="send-back-btn">
            <ChevronLeft size={22} />
          </button>
          <span className="screen-header-title">Send</span>
          <div style={{ width: 40 }} />
        </div>

        {/* Recipient Address */}
        <div style={{ marginTop: 16, marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>
            Recipient Address
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="input-bubble"
              placeholder="Enter or paste address"
              value={recipient}
              onChange={e => {
                setRecipient(e.target.value);
                setError('');
              }}
              style={{ paddingRight: 48, fontSize: 13, fontFamily: 'var(--font-mono)' }}
              id="input-send-recipient"
            />
            <button
              type="button"
              onClick={() => {
                // Paste a clipboard address if it looks like a wallet address
                navigator.clipboard?.readText().then(clip => {
                  if (clip && clip.startsWith('0x')) setRecipient(clip);
                }).catch(() => undefined);
              }}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
              title="Scan or Paste"
            >
              <QrCode size={20} />
            </button>
          </div>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>
            Amount
          </label>
          <div style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => {
                setAmount(e.target.value);
                setError('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--text-primary)',
                width: '60%',
                fontFamily: 'inherit'
              }}
              id="input-send-amount"
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-glass-active)',
              padding: '6px 12px',
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 700,
              border: '1px solid var(--border-color)'
            }}>
              <span>COOP</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Available: {availableCoop.toLocaleString()} COOP
            </span>
            <button
              type="button"
              onClick={() => {
                const max = Math.max(0, availableCoop - networkFee);
                setAmount(max.toFixed(2));
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              MAX
            </button>
          </div>
        </div>

        {/* Fee & Total breakdown */}
        <div style={{
          padding: '14px 16px',
          background: 'var(--bg-glass)',
          borderRadius: 16,
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Network Fee</span>
            <span style={{ fontWeight: 600 }}>{networkFee.toFixed(2)} COOP</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, paddingTop: 4, borderTop: '1px solid var(--border-color)' }}>
            <span>Total</span>
            <span>{total.toFixed(2)} COOP</span>
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

        {success && (
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
            <span>{success}</span>
          </div>
        )}
      </div>

      {/* Review Send Button */}
      <div style={{ paddingTop: 20 }}>
        <button
          className="pill-btn pill-btn-primary"
          onClick={handleReview}
          id="btn-review-send"
        >
          Review Send
        </button>
      </div>

      {/* Review Slide-up Sheet */}
      {showReview && (
        <div className="drawer-backdrop" onClick={() => setShowReview(false)}>
          <div className="drawer-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>Review Transfer</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Recipient:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600 }}>
                  {recipient.length > 20 ? `${recipient.slice(0, 10)}...${recipient.slice(-8)}` : recipient}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Amount:</span>
                <span style={{ fontWeight: 700 }}>{numAmount.toFixed(2)} COOP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Network Fee:</span>
                <span style={{ fontWeight: 600 }}>{networkFee} COOP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
                <span>Total Deduct:</span>
                <span>{total.toFixed(2)} COOP</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="pill-btn pill-btn-secondary" 
                onClick={() => setShowReview(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                className="pill-btn pill-btn-primary" 
                onClick={confirmTransfer}
                disabled={loading}
                style={{ flex: 1 }}
                id="btn-confirm-send"
              >
                {loading ? 'Sending...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
