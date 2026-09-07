import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, HelpCircle, MessageSquare, AlertCircle, Users, ExternalLink } from 'lucide-react';
import { useWallet } from '../context/WalletContext';

interface FaqItem {
  q: string;
  a: string;
}

export const HelpSupportScreen: React.FC = () => {
  const { goBack } = useWallet();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [supportSent, setSupportSent] = useState(false);
  const [modalType, setModalType] = useState<'contact' | 'report' | null>(null);
  const [message, setMessage] = useState('');

  const faqs: FaqItem[] = [
    {
      q: 'What is the difference between COOP and Cooptoken?',
      a: 'COOP is the main liquid cryptocurrency token used for transfers, balance storage, and trading. Cooptoken is the exclusive pre-TGE mining reward token generated every 12 hours. You can swap 1,000 Cooptoken for 1 COOP at any time.'
    },
    {
      q: 'How does the 12-hour mining cycle work?',
      a: 'Mining runs continuously in 12-hour sessions. Each session produces a base of 50 Cooptoken (plus any boosts). Once the countdown completes, tap "Claim" to deposit the tokens to your balance.'
    },
    {
      q: 'What happens if I lose my private key?',
      a: 'COOP is a non-custodial decentralized wallet. We do not store your private key on centralized servers. Make sure to back up your private key in offline storage.'
    },
    {
      q: 'How do Price Boost upgrades work?',
      a: 'Boost upgrades instantly increase your mining output per session. For instance, a $1 boost adds +100 tokens, and $2.50 adds +300 tokens to every session.'
    }
  ];

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSupportSent(true);
    setTimeout(() => {
      setSupportSent(false);
      setModalType(null);
      setMessage('');
    }, 2000);
  };

  return (
    <div className="screen-content" style={{ paddingBottom: 20 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="help-back-btn">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Help & Support</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Main Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {/* FAQ Toggle Header */}
        <div className="bubble-card" style={{ padding: '16px 18px', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <HelpCircle size={22} color="var(--text-primary)" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>FAQ</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Common questions</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                style={{ 
                  background: 'var(--bg-glass)', 
                  borderRadius: 12, 
                  padding: '10px 14px', 
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer' 
                }}
                onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
                  <span>{faq.q}</span>
                  <ChevronRight 
                    size={15} 
                    style={{ transform: activeFaq === idx ? 'rotate(90deg)' : 'none', transition: '0.2s' }} 
                  />
                </div>
                {activeFaq === idx && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact Support */}
        <div 
          className="bubble-card" 
          style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setModalType('contact')}
          id="btn-contact-support"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <MessageSquare size={20} color="var(--text-primary)" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Contact Support</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Get help from our team</div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--text-tertiary)" />
        </div>

        {/* Report a Problem */}
        <div 
          className="bubble-card" 
          style={{ padding: '14px 18px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setModalType('report')}
          id="btn-report-problem"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <AlertCircle size={20} color="var(--text-primary)" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Report a Problem</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>We're here to help</div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--text-tertiary)" />
        </div>

        {/* Community */}
        <div 
          className="bubble-card" 
          style={{ padding: '14px 18px', marginBottom: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <Users size={20} color="var(--text-primary)" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Community</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Join our official channels</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.open('https://t.me/coopcoin', '_blank')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'var(--bg-glass-active)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <span>Telegram</span>
              <ExternalLink size={12} />
            </button>

            <button
              onClick={() => window.open('https://x.com/coopcoin', '_blank')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'var(--bg-glass-active)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <span>X (Twitter)</span>
              <ExternalLink size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Support Message Modal Sheet */}
      {modalType && (
        <div className="drawer-backdrop" onClick={() => setModalType(null)}>
          <div className="drawer-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, textAlign: 'center' }}>
              {modalType === 'contact' ? 'Contact Support' : 'Report an Issue'}
            </h3>

            {supportSent ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--accent-green)', fontWeight: 600 }}>
                Thank you! Your ticket #CP-{Math.floor(1000 + Math.random() * 9000)} has been logged.
              </div>
            ) : (
              <form onSubmit={handleSubmitForm}>
                <textarea
                  className="input-bubble"
                  rows={4}
                  placeholder={modalType === 'contact' ? 'Describe how we can help you...' : 'Provide details about the issue...'}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  style={{ width: '100%', resize: 'none', marginBottom: 16 }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="pill-btn pill-btn-secondary" onClick={() => setModalType(null)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button type="submit" className="pill-btn pill-btn-primary" style={{ flex: 1 }}>
                    Send Message
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
