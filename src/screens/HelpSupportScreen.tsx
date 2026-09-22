import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, HelpCircle, MessageSquare, AlertCircle, Send, Check, CheckCheck, Wifi, WifiOff, ExternalLink, History, Trash2, RotateCcw, Star, Volume2, VolumeX, X, Plus } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { dbService } from '../services/supabase';
import { chatFx, isChatFxMuted, setChatFxMuted } from '../utils/chatFx';

interface ChatMsg {
  id: string;
  sender: 'user' | 'admin';
  body: string;
  createdAt: number;
}

interface SupportTicketSummary {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: number | null;
  unread: number;
  closedBy: 'user' | 'admin' | null;
  closedAt: number | null;
  rating: number | null;
  preview: string;
  messageCount: number;
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

// The support agent reads these, so they are remembered between visits. A blank
// name would leave the admin dashboard showing a faceless "User".
const NAME_KEY = 'coop_support_name';
const EMAIL_KEY = 'coop_support_email';

const lastName = (): string => {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
};
const lastEmail = (): string => {
  try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
};
const rememberContact = (n: string, e: string) => {
  try {
    if (n) localStorage.setItem(NAME_KEY, n);
    if (e) localStorage.setItem(EMAIL_KEY, e);
  } catch { /* storage unavailable - not fatal */ }
};

const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// PostgREST reports a missing/un-deployed RPC as a confusing "schema cache"
// error. Point the operator at the fix instead of showing raw SQL noise.
const friendlyError = (err: any, fallback: string): string => {
  const msg = String(err?.message || '');
  if (/PGRST202|Could not find the function|schema cache/i.test(msg)) {
    return 'Support backend needs an update — run supabase/migration-v8-support-history.sql then supabase/migration-v9-support-ratings.sql in Supabase, then try again.';
  }
  if (/violates check constraint/i.test(msg)) {
    return 'Database constraint out of date — run supabase/migration-v9-support-ratings.sql in Supabase, then try again.';
  }
  return msg || fallback;
};

const Stars = ({ count, onChange }: { count: number; onChange?: (v: number) => void }) => (
  <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <button
        key={s}
        type="button"
        onClick={onChange ? () => onChange(s) : undefined}
        style={{
          fontSize: 22, lineHeight: 1, background: 'none', border: 'none', cursor: onChange ? 'pointer' : 'default',
          padding: 2, color: s <= count ? 'var(--accent-amber, #f59e0b)' : 'var(--text-tertiary, #777)'
        }}
        aria-label={`${s} star${s > 1 ? 's' : ''}`}
      >★</button>
    ))}
  </div>
);

export const HelpSupportScreen: React.FC = () => {
  const { goBack, account } = useWallet();
  // The chat is the main support surface: it shows the conversation list while
  // no conversation is selected, so history lives INSIDE the chat, never in a
  // separate page. `history` below therefore only feeds that in-chat list.
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
  const [closedBy, setClosedBy] = useState<'user' | 'admin' | null>(null);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [savedRatingComment, setSavedRatingComment] = useState<string | null>(null);
  const [showEndPanel, setShowEndPanel] = useState(false);
  const [rateStars, setRateStars] = useState(0);
  const [rateComment, setRateComment] = useState('');
  const [history, setHistory] = useState<SupportTicketSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastTypingTs = useRef(0);
  // Chat history is shown as an in-chat drawer so the user never loses the thread.
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [chatFxMutedState, setChatFxMutedState] = useState<boolean>(isChatFxMuted());
  const lastMsgIdRef = useRef<string | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);

  // Poll the conversation (messages + presence) every 3 seconds.
  useEffect(() => {
    if (!ticketId || !account) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await dbService.pollSupport(ticketId, account.id);
        if (stopped) return;
        // Chime + vibrate only for a genuinely new admin message (never on the
        // first load of a conversation, which would be noise).
        const newest = res.messages[res.messages.length - 1];
        if (newest && newest.sender === 'admin' && lastMsgIdRef.current && newest.id !== lastMsgIdRef.current) {
          chatFx.received();
        }
        if (newest) lastMsgIdRef.current = newest.id;
        setMessages(res.messages);
        setAdminOnline(res.adminOnline);
        setAdminTyping(res.adminTyping);
        setTicketStatus(res.status);
        setAdminLastSeenAt(res.adminLastSeenAt);
        setAdminName(res.adminName);
        setClosedBy(res.closedBy);
        setClosedAt(res.closedAt);
        setRating(res.rating);
        setSavedRatingComment(res.ratingComment);
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

  // Remember who the user is: the agent reads this, so a returning user should
  // never have to retype it (and the admin should never see a blank "User").
  useEffect(() => {
    setName(prev => prev || lastName());
    setEmail(prev => prev || lastEmail());
  }, []);

  const openConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) { setError('You need to be logged in to chat with support.'); return; }
    const body = message.trim();
    if (!body) { setError('Please write a message first.'); return; }
    // Never send a blank name - fall back to a wallet-based label so the agent
    // can still tell who is talking to them.
    const who = name.trim() || `User ${account.address.slice(-6)}`;
    setSending(true);
    setError('');
    try {
      const subject = formType === 'report' ? 'Report a Problem' : 'Support request';
      const id = await dbService.openSupportTicket(account.id, who, email.trim(), subject, body);
      rememberContact(who, email.trim());
      setTicketId(id);
      setTicketStatus('open');
      setClosedBy(null);
      setClosedAt(null);
      setRating(null);
      setSavedRatingComment(null);
      setShowEndPanel(false);
      setRateStars(0);
      setRateComment('');
      setShowChatHistory(false);
      lastMsgIdRef.current = null;
      const res = await dbService.pollSupport(id, account.id);
      setMessages(res.messages);
      lastMsgIdRef.current = res.messages.length ? res.messages[res.messages.length - 1].id : null;
      setView('chat');
      chatFx.sent();
    } catch (err: any) {
      setError(friendlyError(err, 'Could not start the conversation. Try again.'));
      chatFx.failed();
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
      chatFx.sent();
      const res = await dbService.pollSupport(ticketId, account.id);
      setMessages(res.messages);
      lastMsgIdRef.current = res.messages.length ? res.messages[res.messages.length - 1].id : null;
      setAdminTyping(res.adminTyping);
    } catch (err: any) {
      setError(friendlyError(err, 'Could not send your message.'));
      chatFx.failed();
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

  const loadHistory = async () => {
    if (!account) return;
    setHistoryLoading(true);
    setError('');
    try {
      setHistory(await dbService.mySupportTickets(account.id));
    } catch (err: any) {
      setError(friendlyError(err, 'Could not load your chat history.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryChat = (t: SupportTicketSummary) => {
    setTicketId(t.id);
    setMessages([]);
    setError('');
    setShowEndPanel(false);
    setShowChatHistory(false);
    lastMsgIdRef.current = null;
    setRateStars(0);
    setRateComment('');
    setClosedBy(t.closedBy);
    setClosedAt(t.closedAt);
    setRating(t.rating);
    setSavedRatingComment(null);
    setTicketStatus(t.status);
    setView('chat');
  };

  const deleteHistory = async (id: string) => {
    if (!account) return;
    if (!window.confirm('Delete this conversation permanently? This cannot be undone.')) return;
    try {
      await dbService.deleteSupportChat(id, account.id);
      if (ticketId === id) {
        setTicketId(null);
        setMessages([]);
        setShowChatHistory(false);
        lastMsgIdRef.current = null;
        // Back to the chat home (the conversation list) rather than a page.
        setView('chat');
      }
      await loadHistory();
    } catch (err: any) {
      setError(friendlyError(err, 'Could not delete the conversation.'));
    }
  };

  // Opens the chat surface. With no conversation selected it shows the list of
  // past conversations right inside the chat, so the user chooses between
  // continuing a still-open chat or starting a brand new one.
  const openChatHome = async () => {
    setError('');
    setShowChatHistory(false);
    setView('chat');
    await loadHistory();
  };

  const startNewChat = (type: 'contact' | 'report') => {
    setFormType(type);
    setMessage('');
    setError('');
    setShowChatHistory(false);
    setView('form');
  };

  // A conversation is terminal once ended, so "continue" really means "start a
  // fresh conversation with support".
  const startNewChatFromEnded = () => {
    setTicketId(null);
    setMessages([]);
    setShowEndPanel(false);
    setShowChatHistory(false);
    setClosedBy(null);
    setClosedAt(null);
    setRating(null);
    setSavedRatingComment(null);
    setRateStars(0);
    setRateComment('');
    lastMsgIdRef.current = null;
    startNewChat('contact');
  };

  // Toggle the in-chat history drawer (keeps the live conversation on screen).
  const toggleChatHistory = async () => {
    const next = !showChatHistory;
    setShowChatHistory(next);
    setError('');
    if (next) {
      await loadHistory();
      const el = historyRef.current;
      if (el) el.scrollTop = 0;
    }
  };

  const toggleChatFx = () => {
    const next = !chatFxMutedState;
    setChatFxMuted(next);
    setChatFxMutedState(next);
    if (!next) chatFx.received();
  };

  const endChat = async () => {
    if (!ticketId || !account) return;
    setSending(true);
    setError('');
    try {
      await dbService.endSupportChat(ticketId, account.id, rateStars || null, rateComment.trim() || null);
      setShowEndPanel(false);
      chatFx.ended();
      const res = await dbService.pollSupport(ticketId, account.id);
      setMessages(res.messages);
      setTicketStatus(res.status);
      setClosedBy(res.closedBy);
      setClosedAt(res.closedAt);
      setRating(res.rating);
      setSavedRatingComment(res.ratingComment);
    } catch (err: any) {
      setError(friendlyError(err, 'Could not end the chat.'));
      chatFx.failed();
    } finally {
      setSending(false);
    }
  };

  const submitRating = async () => {
    if (!ticketId || !account) return;
    if (!rateStars) { setError('Select a star rating first.'); return; }
    setSending(true);
    setError('');
    try {
      await dbService.rateSupportChat(ticketId, account.id, rateStars, rateComment.trim() || undefined);
      setRateStars(0);
      setRateComment('');
      chatFx.ended();
      const res = await dbService.pollSupport(ticketId, account.id);
      setRating(res.rating);
      setSavedRatingComment(res.ratingComment);
    } catch (err: any) {
      setError(friendlyError(err, 'Could not submit your rating.'));
      chatFx.failed();
    } finally {
      setSending(false);
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
                <div style={{ fontSize: 15, fontWeight: 700 }}>Support Chat</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Continue a conversation or start a new one</div>
              </div>
            </div>
            <button className="pill-btn pill-btn-primary" style={{ width: '100%', marginBottom: 10 }}
              onClick={openChatHome} id="btn-open-support-chat">
              <History size={16} /><span style={{ marginLeft: 6 }}>Open Support Chat &amp; History</span>
            </button>
            <button className="pill-btn pill-btn-secondary" style={{ width: '100%', marginBottom: 10 }}
              onClick={() => startNewChat('contact')} id="btn-contact-support">
              <Plus size={16} /><span style={{ marginLeft: 6 }}>Start a New Conversation</span>
            </button>
            <button className="pill-btn pill-btn-secondary" style={{ width: '100%' }}
              onClick={() => startNewChat('report')} id="btn-report-problem">
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
                onChange={e => setName(e.target.value)} placeholder="Your name — visible to the support agent" maxLength={60} />
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

      {/*
       * The standalone Chat History page is gone on purpose: the conversation
       * list is now rendered INSIDE the chat card above, so the user picks
       * between continuing an open chat and starting a new one in one place.
       */}
      {view === 'chat' && (
        <div className="bubble-card" style={{ padding: 0, marginTop: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', minWidth: 0, height: 'calc(100vh - 150px)', minHeight: 420, maxHeight: 620 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 6, gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-glass-active)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={16} />
            </div>
            <div style={{ flex: 1 }}>
              {/* "Joe" over "Online" - the name the agent signed in the chat. */}
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {ticketId ? (adminName || 'COOP Support') : 'Support Chat'}
              </div>
              {ticketId ? (
                <div className="chat-pop-in" style={{ fontSize: 11, color: adminOnline ? 'var(--accent-green)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {adminOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
                  {adminOnline ? 'Online' : 'Offline'}
                  {adminTyping && <span style={{ color: 'var(--accent-green)' }}> · typing…</span>}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Pick a conversation or start a new one</div>
              )}
            </div>
            {ticketId && isClosed && <span className="tag chat-pop-in" style={{ fontFamily: 'inherit' }}>Closed</span>}
            {ticketId && (
              <button
                className="pill-btn pill-btn-secondary"
                onClick={toggleChatHistory}
                title="Chat history"
                aria-label="Chat history"
                aria-pressed={showChatHistory}
                style={{
                  padding: '6px 10px', fontSize: 11, width: 'auto', flex: '0 0 auto',
                  background: showChatHistory ? 'var(--bg-glass-active)' : undefined
                }}
                id="btn-chat-history">
                <History size={13} />
                <span style={{ marginLeft: 4 }}>History</span>
              </button>
            )}
            {ticketId && (
              <button
                className="pill-btn pill-btn-secondary"
                onClick={toggleChatFx}
                title={chatFxMutedState ? 'Unmute chat sounds' : 'Mute chat sounds'}
                aria-label={chatFxMutedState ? 'Unmute chat sounds' : 'Mute chat sounds'}
                style={{ padding: '6px 8px', fontSize: 11, width: 'auto', flex: '0 0 auto' }}
                id="btn-chat-sound">
                {chatFxMutedState ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
            )}
            {ticketId && !isClosed && (
              <button
                className="pill-btn pill-btn-secondary"
                style={{ padding: '6px 10px', fontSize: 11, width: 'auto', flex: '0 0 auto' }}
                onClick={() => { setShowEndPanel(!showEndPanel); setError(''); }} id="btn-end-chat">
                End chat
              </button>
            )}
          </div>

          {!ticketId ? (
            /* ------------- Chat home: history lives INSIDE the chat ------------- */
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="pill-btn pill-btn-primary" style={{ width: '100%' }}
                onClick={() => startNewChat('contact')} id="btn-start-new-chat">
                <Plus size={16} /><span style={{ marginLeft: 6 }}>Start a new chat</span>
              </button>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }}>
                Your conversations
              </div>
              {historyLoading ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading your conversations…</div>
              ) : !history.length ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '24px 0' }}>
                  No conversations yet — tap “Start a new chat” to talk to support.
                </div>
              ) : (
                history.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12,
                    background: 'var(--bg-glass)', border: '1px solid var(--border-color)'
                  }}>
                    <button
                      onClick={() => openHistoryChat(t)}
                      style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                      aria-label={`${t.status === 'closed' ? 'View' : 'Continue'} ${t.subject || 'conversation'}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.subject || 'Support request'}
                        </span>
                        {t.status === 'closed'
                          ? <span className="tag" style={{ fontFamily: 'inherit', fontSize: 10 }}>Ended</span>
                          : <span className="tag chat-pop-in" style={{ fontFamily: 'inherit', fontSize: 10, color: 'var(--accent-green)' }}>Open</span>}
                        {t.unread > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-red, #ef4444)' }}>{t.unread} new</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {t.rating != null ? `${'★'.repeat(t.rating)} · ` : ''}
                        {t.lastMessageAt != null ? `${fmtDateTime(t.lastMessageAt)} · ` : ''}
                        {t.messageCount > 0 ? `${t.messageCount} message${t.messageCount > 1 ? 's' : ''}` : 'no messages'}
                      </div>
                      {t.preview && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {t.preview.replace(/^\[([^\]]+)\]\s*/, '')}
                        </div>
                      )}
                    </button>
                    <button className="pill-btn pill-btn-secondary" style={{ padding: '6px 8px', width: 'auto', flex: '0 0 auto' }}
                      onClick={() => deleteHistory(t.id)} aria-label="Delete conversation">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
          <>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 6px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0' }}>No messages yet — say hello!</div>
            )}
            {messages.map(m => {
              const mine = m.sender === 'user';
              const readByAdmin = adminLastSeenAt != null && adminLastSeenAt >= m.createdAt;
              return (
                <div key={m.id} className="chat-bubble-in" style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%', borderRadius: 14, padding: '8px 12px',
                    background: mine ? 'var(--accent-green)' : 'var(--bg-glass-active)',
                    color: mine ? '#ffffff' : 'var(--text-primary)', fontSize: 13, lineHeight: 1.45
                  }}>
                    {!mine && adminName && (
                      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, marginBottom: 2 }}>{adminName}</div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body.replace(/^\[([^\]]+)\]\s*/, '')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 10, opacity: 0.8, justifyContent: 'flex-end' }}>
                      <span>{fmtTime(m.createdAt)}</span>
                      {mine && (readByAdmin ? <CheckCheck size={12} /> : <Check size={12} />)}
                    </div>
                  </div>
                </div>
              );
            })}
            {adminTyping && (
              <div className="chat-bubble-in" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: 'var(--bg-glass-active)', borderRadius: 14, padding: '10px 14px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span style={{ fontSize: 11, marginLeft: 4 }}>{adminName || 'Support'} is typing</span>
                </div>
              </div>
            )}

            {isClosed && (
              <div id="chat-ended-banner" style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, padding: '12px 10px', background: 'var(--bg-glass-active)', borderRadius: 12, border: '1px solid var(--border-color)', marginTop: 8 }}>
                <div style={{ fontWeight: 700 }}>
                  This conversation has ended{closedBy === 'user' ? ' — you ended it' : closedBy === 'admin' ? ' — ended by support' : ''}
                </div>
                {closedAt != null && <div style={{ marginTop: 2 }}>{fmtDateTime(closedAt)}</div>}
                {rating != null ? (
                  <div style={{ marginTop: 6 }}>
                    <Stars count={rating} />
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Your rating</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>How was your support experience?</div>
                    <Stars count={rateStars} onChange={setRateStars} />
                    <input
                      className="input-bubble"
                      style={{ width: '100%', marginTop: 8, marginBottom: 8 }}
                      placeholder="Add a comment (optional)"
                      value={rateComment}
                      onChange={e => setRateComment(e.target.value)}
                      maxLength={300}
                    />
                    <button className="pill-btn pill-btn-primary" style={{ width: '100%' }} onClick={submitRating} disabled={sending || !rateStars}>
                      {sending ? 'Sending...' : 'Send rating'}
                    </button>
                  </div>
                )}
                {rating != null && (rateComment.trim() || savedRatingComment) && (
                  <div style={{ marginTop: 6, fontSize: 11, fontStyle: 'italic', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                    “{rateComment.trim() || savedRatingComment}”
                  </div>
                )}
                {/* An ended conversation is terminal: no "continue" - only a new chat. */}
                <button className="pill-btn pill-btn-secondary" style={{ marginTop: 10, width: '100%' }} onClick={startNewChatFromEnded} disabled={sending} id="btn-start-new-after-end">
                  <Plus size={14} /><span style={{ marginLeft: 4 }}>Start a new chat</span>
                </button>
                <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                  This chat can no longer be continued{adminName ? ` — thanks, ${adminName}` : ''}.
                </div>
              </div>
            )}
          </div>

          {showChatHistory && (
            <div id="chat-history-drawer" ref={historyRef} style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-glass-active)', padding: '10px 12px', maxHeight: 280, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Your conversations</div>
                <button className="pill-btn pill-btn-secondary" style={{ padding: '4px 9px', width: 'auto', flex: '0 0 auto' }}
                  onClick={() => setShowChatHistory(false)} aria-label="Close history">
                  <X size={12} />
                </button>
              </div>
              {historyLoading ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading your conversations…</div>
              ) : !history.length ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>No conversations yet.</div>
              ) : (
                history.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, marginBottom: 6,
                    background: t.id === ticketId ? 'var(--bg-surface)' : 'transparent',
                    border: '1px solid var(--border-color)'
                  }}>
                    <button
                      onClick={() => { openHistoryChat(t); setShowChatHistory(false); }}
                      style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                      aria-label={`Open ${t.subject || 'conversation'}`}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.subject || 'Support request'}
                        {t.id === ticketId && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}> · current</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.status === 'closed' ? 'Ended' : 'Open'}
                        {t.rating != null ? ` · ${'★'.repeat(t.rating)}` : ''}
                        {t.lastMessageAt != null ? ` · ${fmtDateTime(t.lastMessageAt)}` : ''}
                        {t.preview ? ` · ${t.preview.replace(/^\[([^\]]+)\]\s*/, '')}` : ''}
                      </div>
                    </button>
                    <button className="pill-btn pill-btn-secondary" style={{ padding: '6px 8px', width: 'auto', flex: '0 0 auto' }}
                      onClick={() => deleteHistory(t.id)} aria-label="Delete conversation">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {showEndPanel && !isClosed && (
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-glass-active)' }} id="end-chat-panel">
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>End this chat?</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                The conversation will close and appear in your chat history. Rate your experience (optional):
              </div>
              <Stars count={rateStars} onChange={setRateStars} />
              <input
                className="input-bubble"
                style={{ width: '100%', marginTop: 8 }}
                placeholder="Add a comment (optional)"
                value={rateComment}
                onChange={e => setRateComment(e.target.value)}
                maxLength={300}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="pill-btn pill-btn-secondary" style={{ flex: 1 }} onClick={() => { setShowEndPanel(false); setRateStars(0); setRateComment(''); }}>Cancel</button>
                <button className="pill-btn pill-btn-primary" style={{ flex: 1 }} onClick={endChat} disabled={sending}>
                  {sending ? 'Ending...' : 'End chat'}
                </button>
              </div>
            </div>
          )}

          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <input
              className="input-bubble"
              style={{ flex: '1 1 auto', width: 'auto', minWidth: 0, padding: '12px 14px', fontSize: 14 }}
              value={input}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
              placeholder={isClosed ? 'Chat ended' : 'Write a message...'}
              disabled={isClosed || !ticketId}
            />
            <button
              className="pill-btn pill-btn-primary"
              style={{ flex: '0 0 auto', width: 'auto', minWidth: 46, padding: '12px 16px' }}
              onClick={sendMessage} disabled={sending || isClosed || !input.trim()}
              aria-label="Send message" id="btn-send-message">
              <Send size={16} />
            </button>
          </div>
          {error && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-red, #ef4444)', padding: '0 14px 8px 14px' }}>{error}</div>}
          </>
          )}
        </div>
      )}
    </div>
  );
};