import React, { useState } from 'react';
import { ChevronLeft, Check, ExternalLink, Calendar, Video, Users, Send } from 'lucide-react';
import { XIcon } from '../components/XIcon';
import { useWallet } from '../context/WalletContext';
import { TaskItem } from '../types';
import confetti from 'canvas-confetti';

export const TasksScreen: React.FC = () => {
  const { goBack, tasks, claimTask } = useWallet();
  const [filter, setFilter] = useState<'all' | 'social' | 'special'>('all');
  const [pendingGo, setPendingGo] = useState<Record<string, boolean>>({});

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true;
    return t.category === filter;
  });

  const handleAction = async (task: TaskItem) => {
    if (task.status === 'claimed') return;

    if (!pendingGo[task.id]) {
      // First click: opens action URL or simulates visiting
      if (task.actionUrl) {
        window.open(task.actionUrl, '_blank');
      }
      setPendingGo(prev => ({ ...prev, [task.id]: true }));
    } else {
      // Second click: claims reward
      const reward = await claimTask(task.id);
      if (reward > 0) {
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.6 }
        });
      }
    }
  };

  const getTaskIcon = (icon: TaskItem['icon']) => {
    switch (icon) {
      case 'x': return <XIcon size={18} />;
      case 'telegram': return <Send size={18} />;
      case 'daily': return <Calendar size={18} />;
      case 'video': return <Video size={18} />;
      case 'invite': return <Users size={18} />;
      default: return <Check size={18} />;
    }
  };

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div className="screen-header">
        <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="tasks-back-btn">
          <ChevronLeft size={22} />
        </button>
        <span className="screen-header-title">Tasks</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        margin: '12px 0 20px 0'
      }}>
        {(['all', 'social', 'special'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: '6px 18px',
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'capitalize',
              background: filter === tab ? 'var(--btn-primary-bg)' : 'var(--bg-glass)',
              color: filter === tab ? 'var(--btn-primary-text)' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            id={`task-tab-${tab}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tasks List (real Supabase catalog only — proper empty state, no fake rows) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px 0', fontSize: 14 }}>
            No tasks available right now. Check back soon.
          </div>
        )}
        {filtered.map(task => {
          const isReadyToClaim = pendingGo[task.id] && task.status !== 'claimed';
          const isClaimed = task.status === 'claimed';

          return (
            <div
              key={task.id}
              className="bubble-card"
              style={{
                padding: '14px 16px',
                marginBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
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
                  color: 'var(--text-primary)'
                }}>
                  {getTaskIcon(task.icon)}
                </div>

                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600, marginTop: 2 }}>
                    +{task.rewardCooptoken} COOP Token
                  </div>
                </div>
              </div>

              <div>
                {isClaimed ? (
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-tertiary)',
                    padding: '6px 14px',
                    borderRadius: 9999,
                    background: 'var(--bg-glass)',
                    border: '1px solid var(--border-color)',
                    display: 'inline-block'
                  }}>
                    Claimed
                  </span>
                ) : (
                  <button
                    onClick={() => handleAction(task)}
                    style={{
                      background: isReadyToClaim ? 'var(--accent-green)' : 'var(--btn-primary-bg)',
                      color: isReadyToClaim ? '#ffffff' : 'var(--btn-primary-text)',
                      border: 'none',
                      borderRadius: 9999,
                      padding: '6px 16px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    id={`task-btn-${task.id}`}
                  >
                    {isReadyToClaim ? 'Claim' : 'Go'}
                    {!isReadyToClaim && task.actionUrl && <ExternalLink size={12} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
