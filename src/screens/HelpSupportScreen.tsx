import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, HelpCircle, MessageSquare, AlertCircle, Send, Check, CheckCheck, Wifi, WifiOff, ExternalLink } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { dbService } from '../services/supabase';

interface ChatMsg {
  id: string;
  sender: 'user' | 'admin';
  body: string;
  createdAt: number;
}

const faqs = [
  { q: 'What is the difference between COOP and Coopoint?',
    a: 'COOP is the main liquid token used for transfers between COOP users. Coopoint is the mining reward token generated every 12 hours. You can swap Coopoint for COOP at any time.' },
  { q: 'How does the 12-hour mining cycle work?',
    a: 'Mining runs a fixed 12-hour session that produces 100 Coopoint per hour (1,200 Coopoint per session plus boosts). Once the countdown ends, tap Claim to deposit the reward, then start the next 12-hour session.' },
  { q: 'What happens if I lose my private key?',
    a: 'COOP is non-custodial. We never store private keys on central servers. Back up your private key in offline storage right away.' },
  { q: 'How do price boosts work?',
    a: 'Boosts are optional speed upgrades that increase your mining rate for 7 days. They stay disabled until availability is announced.' }
];

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const HelpSupportScreen: React.FC = () => {
  const { goBack, account } = useWallet();
  const [view, setView] = useState<'menu' | 'form' | 'chat'>('menu');
  const [formType, setFormType] = useState<'contact' | 'report'>('contact');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [adminOnline, setAdminOnline] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);
  const [ticketStatus, setTicketStatus] = useState('open');
  const [adminLastSeenAt, setAdminLastSeenAt] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastTypingTs = useRef(0);

  // Poll the conversation (messages + presence) every 3 seconds.
  useEffect(() => {
    if (!ticketId || !account) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await dbService.pollSupport(ticketId, account.id);
        if (stopped) return;
        setMessages(res.messages);
        setAdminOnline(res.adminOnline);
        setAdminTyping(res.adminTyping);
        setTicketStatus(res.status);
        setAdminLastSeenAt(res.adminLastSeenAt);
      } catch (e) { /* transient poll failure - retry next tick */ }
    };
    poll();
    const iv = window.setInterval(poll, 3000);
    return () => { stopped = true; window.clearInterval(iv); };
  }, [ticketId, account]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, adminTyping]);

  const openConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) { setError('You need to be logged in to chat with support.'); return; }
    const body = message.trim();
    if (!body) { setError('Please write a message first.'); return; }
    setSending(true);
    setError('');
    try {
      const subject = formType === 'report' ? 'Report a Problem' : 'Support request';
      const id = await dbService.openSupportTicket(account.id, name.trim(), email.trim(), subject, body);
      setTicketId(id);
      const res = await dbService.pollSupport(id, account.id);
      setMessages(res.messages);
      setView('chat');
    } catch (err: any) {
      setError(err?.message || 'Could not start the conversation. Try again.');
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async () => {
    const body = input.trim();
    if (!body || !ticketId || !account || sending) return;
    setSending(true);
    setError('');
    try {
      await dbService.sendSupportMessage(ticketId, account.id, body);
      setInput('');
      const res = await dbService.pollSupport(ticketId, account.id);
      setMessages(res.messages);
      setAdminTyping(res.adminTyping);
    } catch (err: any) {
      setError(err?.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  const handleInput = (v: string) => {
    setInput(v);
    if (ticketId && account && v) {
      const now = Date.now();
      if (now - lastTypingTs.current > 2000) {
        lastTypingTs.current = now;
        dbService.supportTyping(ticketId, account.id).catch(() => {});
      }
    }
  };

  const isClosed = ticketStatus === 'closed';

  return (
    <div className="screen-content" style={{ paddingBottom: 20 }}>
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="help-back-btn">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Help &amp; Support</span>
        <div style={{ width: 40 }} />
      </div>

      {view === 'menu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <div className="bubble-card" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
              <HelpCircle size={22} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>FAQ</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Common questions</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {faqs.map((faq, idx) => (
                <div key={idx} onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  style={{ background: 'var(--bg-glass)', borderRadius: 12, padding: '10px 14px', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{faq.q}</div>
                  {activeFaq === idx && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 6 }}>{faq.a}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bubble-card" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <MessageSquare size={22} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Live Support</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Talk directly to an admin in real time</div>
              </div>
            </div>
            <button className="pill-btn pill-btn-primary" style={{ width: '100%', marginBottom: 10 }}
              onClick={() => { setFormType('contact'); setMessage(''); setError(''); setView('form'); }} id="btn-contact-support">
              Start a Conversation
            </button>
            <button className="pill-btn pill-btn-secondary" style={{ width: '100%' }}
              onClick={() => { setFormType('report'); setMessage(''); setError(''); setView('form'); }} id="btn-report-problem">
              <AlertCircle size={16} /><span style={{ marginLeft: 6 }}>Report a Problem</span>
            </button>
          </div>

          <div className="bubble-card" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <HelpCircle size={22} color="var(--text-primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Community</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Official channels</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => window.open('https://t.me/coopcoin', '_blank')} style={{
                flex: 1, padding: '8px 12px', borderRadius: 10, background: 'var(--bg-glass-active)',
                border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>Telegram</span><ExternalLink size={12} />
              </button>
              <button onClick={() => window.open('https://x.com/coopcoin', '_blank')} style={{
                flex: 1, padding: '8px 12px', borderRadius: 10, background: 'var(--bg-glass-active)',
                border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>X (Twitter)</span><ExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'form' && (
        <div className="bubble-card" style={{ padding: 16, marginTop: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
            {formType === 'report' ? 'Report a Problem' : 'Start a Conversation'}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Tell us who you are and what you need. Your messages go straight to the COOP admin panel.
          </p>
          <form onSubmit={openConversation}>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Name</label>
              <input className="input-bubble" style={{ width: '100%' }} value={name}
                onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={60} />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Email</label>
              <input className="input-bubble" style={{ width: '100%' }} type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@email.com" maxLength={120} />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>{formType === 'report' ? 'What went wrong?' : 'Message'}</label>
              <textarea className="input-bubble" style={{ width: '100%', resize: 'none' }} rows={4}
                value={message} onChange={e => setMessage(e.target.value)}
                placeholder={formType === 'report' ? 'Describe the problem in detail...' : 'How can we help you?'} autoFocus />
            </div>
            {error && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-red, #ef4444)', marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="pill-btn pill-btn-secondary" style={{ flex: 1 }} onClick={() => setView('menu')}>Back</button>
              <button type="submit" className="pill-btn pill-btn-primary" style={{ flex: 2 }} disabled={sending}>
                {sending ? 'Connecting...' : 'Start Chat'}
              </button>
            </div>
          </form>
        </div>
      )}

      {view === 'chat' && (
        <div className="bubble-card" style={{ padding: 0, marginTop: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', maxHeight: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-glass-active)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>COOP Support</div>
              <div style={{ fontSize: 11, color: adminOnline ? 'var(--accent-green)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {adminOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
                {adminOnline ? 'Online' : 'Offline'}
                {adminTyping && <span style={{ color: 'var(--accent-green)' }}> · typing…</span>}
              </div>
            </div>
            {isClosed && <span className="tag" style={{ fontFamily: 'inherit' }}>Closed</span>}
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 6px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0' }}>No messages yet — say hello!</div>
            )}
            {messages.map(m => {
              const mine = m.sender === 'user';
              const readByAdmin = adminLastSeenAt != null && adminLastSeenAt >= m.createdAt;
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%', borderRadius: 14, padding: '8px 12px',
                    background: mine ? 'var(--accent-green)' : 'var(--bg-glass-active)',
                    color: mine ? '#ffffff' : 'var(--text-primary)', fontSize: 13, lineHeight: 1.45
                  }}>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 10, opacity: 0.8, justifyContent: 'flex-end' }}>
                      <span>{fmtTime(m.createdAt)}</span>
                      {mine && (readByAdmin ? <CheckCheck size={12} /> : <Check size={12} />)}
                    </div>
                  </div>
                </div>
              );
            })}
            {adminTyping && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: 'var(--bg-glass-active)', borderRadius: 14, padding: '8px 12px', fontSize: 13, color: 'var(--text-tertiary)' }}>Typing…</div>
              </div>
            )}
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
            <input
              className="input-bubble"
              style={{ flex: 1, minWidth: 0 }}
              value={input}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
              placeholder={isClosed ? 'This conversation is closed' : 'Write a message...'}
              disabled={isClosed || !ticketId}
            />
            <button className="pill-btn pill-btn-primary" style={{ minWidth: 46, justifyContent: 'center' }}
              onClick={sendMessage} disabled={sending || isClosed || !input.trim()}>
              <Send size={16} />
            </button>
          </div>
          {error && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-red, #ef4444)', padding: '0 14px 8px 14px' }}>{error}</div>}
        </div>
      )}
    </div>
  );
};