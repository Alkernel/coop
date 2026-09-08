import React, { useState, useEffect } from 'react';
import { ChevronLeft, Shield, AlertCircle, Check, Save, RefreshCw } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { dbService } from '../services/supabase';
import { AppSettings } from '../types';

interface FormState {
  baseMiningRate: string;
  dailyMiningHours: string;
  pointsPerCoop: string;
  dailyConversionLimitPoints: string;
  totalCoopRewardPool: string;
  remainingCoopRewardPool: string;
  miningEnabled: boolean;
  conversionEnabled: boolean;
  boostPurchasesEnabled: boolean;
  boostsStackable: boolean;
  swapRateLimitSeconds: string;
  boostTiersJson: string;
}

const EMPTY_FORM: FormState = {
  baseMiningRate: '',
  dailyMiningHours: '',
  pointsPerCoop: '',
  dailyConversionLimitPoints: '',
  totalCoopRewardPool: '',
  remainingCoopRewardPool: '',
  miningEnabled: true,
  conversionEnabled: true,
  boostPurchasesEnabled: false,
  boostsStackable: false,
  swapRateLimitSeconds: '',
  boostTiersJson: ''
};

export const AdminScreen: React.FC = () => {
  const { goBack } = useWallet();
  const [adminKey, setAdminKey] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const s: AppSettings = await dbService.getSettings();
      setForm({
        baseMiningRate: String(s.baseMiningRate),
        dailyMiningHours: String(s.dailyMiningHours),
        pointsPerCoop: String(s.pointsPerCoop),
        dailyConversionLimitPoints: String(s.dailyConversionLimitPoints),
        totalCoopRewardPool: String(s.totalCoopRewardPool),
        remainingCoopRewardPool: String(s.remainingCoopRewardPool),
        miningEnabled: s.miningEnabled,
        conversionEnabled: s.conversionEnabled,
        boostPurchasesEnabled: s.boostPurchasesEnabled,
        boostsStackable: s.boostsStackable,
        swapRateLimitSeconds: String(s.swapRateLimitSeconds),
        boostTiersJson: JSON.stringify(s.boostTiers, null, 2)
      });
      setLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof FormState, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
    setSuccess('');
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    if (!adminKey.trim()) {
      setError('Admin key is required to save changes.');
      return;
    }

    let boostTiers: any;
    try {
      boostTiers = JSON.parse(form.boostTiersJson);
      if (!Array.isArray(boostTiers)) throw new Error('Boost tiers must be a JSON array');
    } catch (e: any) {
      setError(`Invalid boost tiers JSON: ${e.message}`);
      return;
    }

    const updates: Record<string, any> = {
      base_mining_rate: parseFloat(form.baseMiningRate),
      daily_mining_hours: parseFloat(form.dailyMiningHours),
      points_per_coop: parseFloat(form.pointsPerCoop),
      daily_conversion_limit_points: parseFloat(form.dailyConversionLimitPoints),
      total_coop_reward_pool: parseFloat(form.totalCoopRewardPool),
      remaining_coop_reward_pool: parseFloat(form.remainingCoopRewardPool),
      mining_enabled: form.miningEnabled,
      conversion_enabled: form.conversionEnabled,
      boost_purchases_enabled: form.boostPurchasesEnabled,
      boosts_stackable: form.boostsStackable,
      swap_rate_limit_seconds: parseInt(form.swapRateLimitSeconds, 10),
      boost_tiers: boostTiers
    };

    for (const [key, val] of Object.entries(updates)) {
      if (typeof val === 'number' && (isNaN(val) || val < 0)) {
        setError(`Invalid value for ${key}`);
        return;
      }
    }

    setSaving(true);
    try {
      await dbService.adminSetSettings(adminKey.trim(), updates);
      setSuccess('Settings saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div
      className="bubble-card"
      style={{ padding: '12px 16px', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: checked ? 'var(--accent-green)' : 'var(--bg-glass-active)',
          borderRadius: 9999,
          transition: '0.3s'
        }}>
          <span style={{
            position: 'absolute',
            width: 20,
            height: 20,
            left: checked ? 25 : 3,
            bottom: 3,
            backgroundColor: '#ffffff',
            borderRadius: '50%',
            transition: '0.3s'
          }} />
        </span>
      </label>
    </div>
  );

  const NumInput = ({ label, value, onChange, field }: { label: string; value: string; onChange: (v: string) => void; field: string }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <input
        type="number"
        className="input-bubble"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={label}
        style={{ fontSize: 14 }}
        id={`admin-input-${field}`}
      />
    </div>
  );

  return (
    <div className="screen-content" style={{ minHeight: '100%', justifyContent: 'space-between', paddingBottom: 20 }}>
      <div>
        <div className="screen-header">
          <button className="header-icon-btn" onClick={goBack} aria-label="Back" id="admin-back-btn">
            <ChevronLeft size={22} />
          </button>
          <span className="screen-header-title">Admin Panel</span>
          <button className="header-icon-btn" onClick={loadSettings} aria-label="Refresh" disabled={loading} id="admin-refresh-btn">
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="bubble-card" style={{ padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Shield size={18} color="var(--accent-blue)" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Admin Authentication</span>
          </div>
          <input
            type="password"
            className="input-bubble"
            placeholder="Enter admin key"
            value={adminKey}
            onChange={e => { setAdminKey(e.target.value); setError(''); }}
            style={{ fontSize: 14 }}
            id="admin-key-input"
          />
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>Loading settings...</div>}

        {loaded && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '1px', color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>
                Mining
              </div>
              <NumInput label="Base Mining Rate (Coopoints/hour)" value={form.baseMiningRate} onChange={v => updateField('baseMiningRate', v)} field="base-rate" />
              <NumInput label="Daily Mining Hours" value={form.dailyMiningHours} onChange={v => updateField('dailyMiningHours', v)} field="daily-hours" />
              <Toggle checked={form.miningEnabled} onChange={v => updateField('miningEnabled', v)} label="Mining Enabled" />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '1px', color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>
                Conversion
              </div>
              <NumInput label="Points Per COOP (10 = 10 points per 1 COOP)" value={form.pointsPerCoop} onChange={v => updateField('pointsPerCoop', v)} field="points-per-coop" />
              <NumInput label="Daily Conversion Limit (points)" value={form.dailyConversionLimitPoints} onChange={v => updateField('dailyConversionLimitPoints', v)} field="daily-limit" />
              <Toggle checked={form.conversionEnabled} onChange={v => updateField('conversionEnabled', v)} label="Conversion Enabled" />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '1px', color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>
                COOP Reward Pool
              </div>
              <NumInput label="Total COOP Reward Pool" value={form.totalCoopRewardPool} onChange={v => updateField('totalCoopRewardPool', v)} field="total-pool" />
              <NumInput label="Remaining COOP Reward Pool" value={form.remainingCoopRewardPool} onChange={v => updateField('remainingCoopRewardPool', v)} field="remaining-pool" />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '1px', color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>
                Boosts
              </div>
              <Toggle checked={form.boostPurchasesEnabled} onChange={v => updateField('boostPurchasesEnabled', v)} label="Boost Purchases Enabled" />
              <Toggle checked={form.boostsStackable} onChange={v => updateField('boostsStackable', v)} label="Boosts Stackable" />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '1px', color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>
                Anti-Abuse
              </div>
              <NumInput label="Swap Rate Limit (seconds between swaps)" value={form.swapRateLimitSeconds} onChange={v => updateField('swapRateLimitSeconds', v)} field="rate-limit" />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '1px', color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>
                Boost Tiers (JSON)
              </div>
              <textarea
                className="input-bubble"
                value={form.boostTiersJson}
                onChange={e => updateField('boostTiersJson', e.target.value)}
                rows={8}
                placeholder="JSON array of boost tiers"
                style={{ fontSize: 12, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                id="admin-boost-tiers"
              />
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.12)',
            color: 'var(--accent-red)',
            fontSize: 13,
            marginTop: 16,
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
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Check size={16} />
            <span>{success}</span>
          </div>
        )}
      </div>

      <div style={{ paddingTop: 20 }}>
        <button
          className="pill-btn pill-btn-primary"
          onClick={handleSave}
          disabled={saving || loading}
          id="admin-save-btn"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};