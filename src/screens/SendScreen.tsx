import React, { useRef, useState } from 'react';
import { ChevronLeft, QrCode, AlertCircle, Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { CoinIcon } from '../components/CoinIcon';
import { COOP_ASSET } from '../utils/assets';
import { explorerTxPath } from '../explorer/route';
import confetti from 'canvas-confetti';

// Send is a small state machine: form -> confirm -> processing -> done.
// Nothing is ever reported as sent unless the Coop ledger confirmed it.
type SendStep = 'form' | 'confirm' | 'processing' | 'done';
type ProcessStage = 'preparing' | 'processing' | 'confirming' | 'completed';

interface SendReceipt {
  amount: number;
  recipient: string;
  fee: number;
  status: string;
  txHash: string;
  timestamp: number;
  memo?: string;
}

const STAGES: { id: ProcessStage; label: string; hint: string }[] = [
  { id: 'preparing', label: 'Processing', hint: 'Validating recipient and available balance' },
  { id: 'processing', label: 'Processing', hint: 'Submitting the transfer to the Coop ledger' },
  { id: 'confirming', label: 'Confirming', hint: 'Waiting for the ledger to confirm the transfer' },
  { id: 'completed', label: 'Completed', hint: 'Transfer recorded on the Coop ledger' }
];

const stageIndex = (stage: ProcessStage): number => STAGES.findIndex(s => s.id === stage);

export const SendScreen: React.FC = () => {
  const { goBack, account, executeSend, transactions, openTransaction, navigateTo } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [memo, setMemo] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<SendStep>('form');
  const [stage, setStage] = useState<ProcessStage>('preparing');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<SendReceipt | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const numAmount = parseFloat(amount) || 0;
  // Internal user-to-user COOP transfers: no network fee.
  const total = numAmount > 0 ? numAmount : 0;
  const availableCoop = account?.coopBalance || 0;

  // The real ledger row for the transfer we just made ("View Transaction").
  const ledgerRow = receipt
    ? transactions.find(t => t.txType === 'send' && t.txHash === receipt.txHash) || null
    : null;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleReview = () => {
    setError('');
    setReceipt(null);
    if (!recipient.trim()) {
      setError('Please enter the recipient COOP wallet address.');
      return;
    }
    if (!recipient.trim().startsWith('0x')) {
      setError('Recipient address looks invalid. Paste the full COOP wallet address.');
      return;
    }
    if (account && recipient.trim().toLowerCase() === account.address.toLowerCase()) {
      setError('You cannot send COOP to yourself.');
      return;
    }
    if (numAmount <= 0) {
      setError('Please enter an amount greater than 0.');
      return;
    }
    if (total > availableCoop) {
      setError('Insufficient COOP balance.');
      return;
    }
    setStep('confirm');
  };

  const confirmTransfer = async () => {
    // Guard against double-click / duplicate submissions.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError('');
    setStep('processing');
    setStage('preparing');

    const dest = recipient.trim();
    const sendAmount = numAmount;
    const sentMemo = memo.trim();

    try {
      setStage('processing');
      const res = await executeSend(dest, sendAmount, sentMemo || undefined);
      setStage('confirming');
      await new Promise(r => setTimeout(r, 550));
      setStage('completed');
      await new Promise(r => setTimeout(r, 500));

      setReceipt({
        amount: res.amount,
        recipient: res.recipientAddress,
        fee: res.fee,
        status: res.status,
        txHash: res.txHash,
        timestamp: Date.now(),
        memo: sentMemo || undefined
      });
      setStep('done');
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 }
      });
      setRecipient('');
      setAmount('');
      setMemo('');
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
      setStep('form');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const resetForm = () => {
    setStep('form');
    setReceipt(null);
    setError('');
  };

  const header = (title: string, onBack: () => void) => (
    <div className="screen-header">
      <button className="header-icon-btn" onClick={onBack} aria-label="Back" id="send-back-btn">
        <ChevronLeft size={22} />
      </button>
      <span className="screen-header-title">{title}</span>
      <div style={{ width: 40 }} />
    </div>
  );

  const kvRow = (
    label: string,
    value: React.ReactNode,
    opts?: { mono?: boolean; strong?: boolean; border?: boolean }
  ) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      padding: '11px 0',
      borderBottom: opts?.border === false ? 'none' : '1px solid var(--border-color)'
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: opts?.strong ? 14.5 : 13,
        fontWeight: opts?.strong ? 800 : 600,
        textAlign: 'right',
        wordBreak: 'break-all',
        fontFamily: opts?.mono ? 'var(--font-mono)' : undefined
      }}>
        {value}
      </span>
    </div>
  );

  // ---------------------------------------------------------------- processing
  if (step === 'processing') {
    const active = stageIndex(stage);
    return (
      <div className="screen-content" style={{ justifyContent: 'center' }}>
        {header('Sending', () => undefined)}
        <div className="coop-fade-up" style={{ textAlign: 'center', padding: '10px 0 26px 0' }}>
          <div style={{
            width: 96,
            height: 96,
            margin: '0 auto 22px auto',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div className="coop-ring-pulse" style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid var(--border-color)'
            }} />
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: stage === 'completed' ? 'var(--accent-green)' : 'var(--text-primary)',
              animation: stage === 'completed' ? 'none' : 'coopSpin 1s linear infinite',
              opacity: stage === 'completed' ? 0 : 1
            }} />
            {stage === 'completed' ? (
              <div className="coop-check-pop" style={{
                width: 54, height: 54, borderRadius: '50%',
                background: 'var(--accent-green-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Check size={26} color="var(--accent-green)" />
              </div>
            ) : (
              <CoinIcon coin={COOP_ASSET.coin} size={44} />
            )}
          </div>

          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.3px' }}>
            {STAGES[Math.max(active, 0)].label}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
            {STAGES[Math.max(active, 0)].hint}
          </div>
        </div>

        <div className="bubble-card" style={{ padding: '6px 18px' }}>
          {STAGES.map((s, i) => {
            const done = i < Math.max(active, 0) || stage === 'completed';
            const current = i === active && stage !== 'completed';
            return (
              <div key={s.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 0',
                borderBottom: i === STAGES.length - 1 ? 'none' : '1px solid var(--border-color)'
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border-color)',
                  background: done ? 'var(--accent-green-bg)' : 'var(--bg-glass)'
                }}>
                  {done ? <Check size={13} color="var(--accent-green)" /> : <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: current ? 'var(--text-primary)' : 'var(--text-tertiary)'
                  }} />}
                </span>
                <span style={{
                  fontSize: 13,
                  fontWeight: current || done ? 700 : 500,
                  color: current || done ? 'var(--text-primary)' : 'var(--text-tertiary)'
                }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 4px 0 4px', display: 'flex', gap: 8 }}>
          <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Do not close the app while the ledger confirms your transfer.</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 14 }}>
          {numAmount.toFixed(2)} COOP to {recipient.length > 22 ? `${recipient.slice(0, 10)}…${recipient.slice(-8)}` : recipient}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------- done
  if (step === 'done' && receipt) {
    const explorerHref = explorerTxPath(receipt.txHash);
    return (
      <div className="screen-content" style={{ paddingBottom: 18 }}>
        {header('Transfer', () => navigateTo('home'))}

        <div className="coop-fade-up" style={{ textAlign: 'center', padding: '8px 0 18px 0' }}>
          <div className="coop-check-pop" style={{
            width: 74, height: 74, borderRadius: '50%', margin: '0 auto 16px auto',
            background: 'var(--accent-green-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Check size={34} color="var(--accent-green)" />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Transfer complete</div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.6px', margin: '6px 0 10px 0' }}>
            {receipt.amount.toFixed(2)} <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)' }}>COOP</span>
          </div>
          <span className="badge-tag badge-green">
            {receipt.status === 'Complete' ? 'Completed' : receipt.status}
          </span>
        </div>

        <div className="bubble-card" style={{ padding: '6px 18px' }}>
          {kvRow('To', receipt.recipient, { mono: true })}
          {kvRow('Asset', (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <CoinIcon coin={COOP_ASSET.coin} size={17} /> Coopcoin (COOP)
            </span>
          ))}
          {kvRow('Network fee', receipt.fee === 0 ? 'Free — internal transfer' : `${receipt.fee}`)}
          {receipt.memo ? kvRow('Comment', receipt.memo) : null}
          {kvRow('Transaction hash', (
            <button
              onClick={() => copy(receipt.txHash, 'hash')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-mono)', fontSize: 11.5,
                color: copied === 'hash' ? 'var(--accent-green)' : 'var(--text-secondary)',
                wordBreak: 'break-all', textAlign: 'right'
              }}
            >
              {receipt.txHash}
              {copied === 'hash' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          ), { border: false })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="pill-btn pill-btn-primary"
            onClick={() => {
              if (ledgerRow) openTransaction(ledgerRow);
              else navigateTo('history');
            }}
            id="btn-view-transaction"
          >
            View Transaction
          </button>

          <a
            className="pill-btn pill-btn-secondary"
            href={explorerHref}
            style={{ textDecoration: 'none' }}
            id="btn-view-on-explorer"
          >
            <ExternalLink size={15} />
            View on Coop Explorer
          </a>

          <button className="pill-btn pill-btn-secondary" onClick={resetForm}>
            Send another transfer
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ confirm
  if (step === 'confirm') {
    return (
      <div className="screen-content" style={{ paddingBottom: 18 }}>
        {header('Confirm transfer', () => setStep('form'))}

        <div className="bubble-card bubble-card-elevated coop-fade-up" style={{ textAlign: 'center', padding: '22px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <CoinIcon coin={COOP_ASSET.coin} size={44} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600 }}>You are sending</div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.6px', marginTop: 4 }}>
            {numAmount.toFixed(2)}
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginLeft: 6 }}>COOP</span>
          </div>
        </div>

        <div className="bubble-card" style={{ padding: '6px 18px' }}>
          {kvRow('Recipient', recipient.trim(), { mono: true })}
          {kvRow('Asset', 'Coopcoin (COOP)')}
          {kvRow('Network', 'COOP internal ledger')}
          {kvRow('Network fee', '0.00 COOP (internal)')}
          {memo.trim() ? kvRow('Comment', memo.trim()) : null}
          {kvRow('Total deducted', `${total.toFixed(2)} COOP`, { strong: true, border: false })}
        </div>

        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '12px 14px', borderRadius: 16,
          background: 'var(--bg-glass)', border: '1px solid var(--border-color)',
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16
        }}>
          <AlertCircle size={15} color="var(--accent-yellow)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            COOP transfers are final. Check the recipient address — an internal
            transfer cannot be reversed. No blockchain fee is charged.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="pill-btn pill-btn-secondary"
            onClick={() => setStep('form')}
            style={{ flex: 1 }}
            disabled={loading}
          >
            Back
          </button>
          <button
            className="pill-btn pill-btn-primary"
            onClick={confirmTransfer}
            disabled={loading}
            style={{ flex: 1 }}
            id="btn-confirm-send"
          >
            {loading ? 'Sending…' : 'Confirm & Send'}
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------- form
  return (
    <div className="screen-content" style={{ minHeight: '100%', justifyContent: 'space-between' }}>
      <div>
        {header('Send', goBack)}

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
              <CoinIcon coin={COOP_ASSET.coin} size={16} />
              <span>COOP</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Available: {availableCoop.toLocaleString()} COOPCoin
            </span>
            <button
              type="button"
              onClick={() => {
                setAmount(availableCoop.toFixed(2));
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

        {/* Comment (memo) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>
            Comment (optional)
          </label>
          <input
            type="text"
            className="input-bubble"
            placeholder="Add a note for the recipient (max 200 chars)"
            value={memo}
            maxLength={200}
            onChange={e => setMemo(e.target.value)}
            style={{ fontSize: 13 }}
            id="input-send-memo"
          />
        </div>

        {/* Internal transfer: no network fee (no blockchain leg yet) */}
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
            <span style={{ fontWeight: 600 }}>0.00 COOPCoin (internal)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, paddingTop: 4, borderTop: '1px solid var(--border-color)' }}>
            <span>Total</span>
            <span>{total.toFixed(2)} COOPCoin</span>
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
      </div>

      <div style={{ paddingTop: 8 }}>
        <button
          className="pill-btn pill-btn-primary"
          onClick={handleReview}
          disabled={loading}
          id="btn-review-send"
        >
          Review transfer
        </button>
      </div>
    </div>
  );
};
