'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { platformAdminAPI } from '@/lib/api';

type Tab = 'features' | 'subscription' | 'trial';
const VALID_TIERS = ['community', 'pro', 'enterprise', 'govcloud'];
const FEATURE_NAMES = ['sbom', 'reports', 'evidence', 'assessments', 'ai_monitoring', 'data_governance', 'vendor_risk', 'security_posture', 'threat_intel', 'siem', 'regulatory_news'];

export default function OrgManagePage() {
  const params = useParams();
  const orgId = params.id as string;
  const [tab, setTab] = useState<Tab>('features');
  const [message, setMessage] = useState('');

  // Features state
  const [orgTier, setOrgTier] = useState('community');
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [tierOverride, setTierOverride] = useState('');
  const [betaInput, setBetaInput] = useState('');

  // Subscription state
  const [subscription, setSubscription] = useState<any>(null);
  const [newTier, setNewTier] = useState('');
  const [compTier, setCompTier] = useState('pro');
  const [compMonths, setCompMonths] = useState(3);
  const [cancelReason, setCancelReason] = useState('');

  // Trial state
  const [trial, setTrial] = useState<any>(null);
  const [trialDays, setTrialDays] = useState(14);
  const [trialAction, setTrialAction] = useState('extend');
  const [trialConvertTier, setTrialConvertTier] = useState('pro');

  const loadAll = useCallback(async () => {
    try {
      const [featRes, subRes, trialRes] = await Promise.all([
        platformAdminAPI.getOrgFeatures(orgId),
        platformAdminAPI.getOrgSubscription(orgId),
        platformAdminAPI.getOrgTrial(orgId),
      ]);
      const feat = featRes.data.data;
      setOrgTier(feat.tier || 'community');
      setOverrides(feat.feature_overrides || {});
      setTierOverride(feat.feature_overrides?.tier_override || '');
      setBetaInput((feat.feature_overrides?.beta_features || []).join(', '));
      setSubscription(subRes.data.data);
      setTrial(trialRes.data.data);
    } catch {
      setMessage('Failed to load organization data');
    }
  }, [orgId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  // ---------- Features tab handlers ----------
  const getFeatureState = (name: string): 'default' | 'on' | 'off' => {
    const features = overrides.features || {};
    if (features[name] === true) return 'on';
    if (features[name] === false) return 'off';
    return 'default';
  };

  const cycleFeature = (name: string) => {
    const current = getFeatureState(name);
    const next = current === 'default' ? 'on' : current === 'on' ? 'off' : 'default';
    const features = { ...(overrides.features || {}) };
    if (next === 'on') features[name] = true;
    else if (next === 'off') features[name] = false;
    else delete features[name];
    setOverrides({ ...overrides, features });
  };

  const saveFeatures = async () => {
    const payload: Record<string, any> = { ...overrides };
    if (tierOverride) payload.tier_override = tierOverride;
    else delete payload.tier_override;
    const betas = betaInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (betas.length > 0) payload.beta_features = betas;
    else delete payload.beta_features;
    try {
      await platformAdminAPI.updateOrgFeatures(orgId, payload);
      flash('Feature overrides saved');
      await loadAll();
    } catch {
      flash('Failed to save features');
    }
  };

  // ---------- Subscription handlers ----------
  const changeTier = async () => {
    if (!newTier) return;
    try {
      await platformAdminAPI.changeOrgTier(orgId, { tier: newTier });
      flash(`Tier changed to ${newTier}`);
      await loadAll();
    } catch {
      flash('Failed to change tier');
    }
  };

  const cancelSub = async (immediately: boolean) => {
    if (!confirm(immediately ? 'Cancel subscription IMMEDIATELY? The org will drop to free tier.' : 'Cancel at period end?')) return;
    try {
      await platformAdminAPI.cancelOrgSubscription(orgId, { immediately, reason: cancelReason });
      flash(immediately ? 'Subscription canceled immediately' : 'Marked for cancellation');
      await loadAll();
    } catch {
      flash('Failed to cancel subscription');
    }
  };

  const compAccount = async () => {
    try {
      await platformAdminAPI.compOrgSubscription(orgId, { tier: compTier, months: compMonths });
      flash(`Comped ${compTier} for ${compMonths} months`);
      await loadAll();
    } catch {
      flash('Failed to comp account');
    }
  };

  const reactivate = async () => {
    try {
      await platformAdminAPI.reactivateOrgSubscription(orgId);
      flash('Subscription reactivated');
      await loadAll();
    } catch {
      flash('Failed to reactivate');
    }
  };

  // ---------- Trial handlers ----------
  const applyTrialAction = async () => {
    const payload: any = { action: trialAction };
    if (trialAction === 'extend' || trialAction === 'shorten' || trialAction === 'restart') payload.days = trialDays;
    if (trialAction === 'convert') payload.tier = trialConvertTier;
    if (trialAction === 'restart') payload.tier = trialConvertTier;
    try {
      await platformAdminAPI.updateOrgTrial(orgId, payload);
      flash(`Trial action '${trialAction}' applied`);
      await loadAll();
    } catch (err: any) {
      flash(err.response?.data?.error || 'Failed to update trial');
    }
  };

  const BADGE = { default: 'bg-gray-600', on: 'bg-green-600', off: 'bg-red-600' };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl">
        <h1 className="text-2xl font-bold text-white mb-1">Manage Organization</h1>
        <p className="text-gray-400 mb-4">ID: {orgId} &middot; Current tier: <span className="font-semibold text-white">{orgTier}</span></p>

        {message && <div className="mb-4 px-4 py-2 bg-amber-800/50 text-amber-200 rounded text-sm">{message}</div>}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-700 mb-6">
          {(['features', 'subscription', 'trial'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize rounded-t transition-colors ${
                tab === t ? 'bg-gray-800 text-white border-b-2 border-amber-500' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ===== FEATURES TAB ===== */}
        {tab === 'features' && (
          <div className="space-y-6">
            {/* Effective tier */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Tier Override (effective tier)</label>
              <select
                value={tierOverride}
                onChange={(e) => setTierOverride(e.target.value)}
                className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">None (use actual tier)</option>
                {VALID_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Per-feature toggles */}
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Feature Overrides (click to cycle: Default → Force On → Force Off)</h3>
              <div className="grid grid-cols-2 gap-2">
                {FEATURE_NAMES.map((name) => {
                  const state = getFeatureState(name);
                  return (
                    <button
                      key={name}
                      onClick={() => cycleFeature(name)}
                      className={`flex items-center justify-between px-3 py-2 rounded text-sm text-white ${BADGE[state]}`}
                    >
                      <span>{name.replace(/_/g, ' ')}</span>
                      <span className="text-xs opacity-80">{state.toUpperCase()}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Beta features */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Beta Feature Grants (comma-separated)</label>
              <input
                value={betaInput}
                onChange={(e) => setBetaInput(e.target.value)}
                className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="e.g. newDashboard, advancedReports"
              />
            </div>

            <button onClick={saveFeatures} className="px-5 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-500">
              Save Feature Overrides
            </button>
          </div>
        )}

        {/* ===== SUBSCRIPTION TAB ===== */}
        {tab === 'subscription' && subscription && (
          <div className="space-y-6">
            {/* Plan card */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                <div><span className="text-gray-500">Tier:</span> {subscription.tier}</div>
                <div><span className="text-gray-500">Billing Status:</span> {subscription.billing_status}</div>
                <div><span className="text-gray-500">Paid Tier:</span> {subscription.paid_tier || '-'}</div>
                <div><span className="text-gray-500">Stripe Customer:</span> {subscription.stripe_customer_id || 'None'}</div>
              </div>
            </div>

            {/* Change tier */}
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Change Tier</label>
                <select value={newTier} onChange={(e) => setNewTier(e.target.value)} className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select…</option>
                  {VALID_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button onClick={changeTier} disabled={!newTier} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-500 disabled:opacity-50">
                Apply
              </button>
            </div>

            {/* Comp account */}
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Comp Account — Tier</label>
                <select value={compTier} onChange={(e) => setCompTier(e.target.value)} className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  {VALID_TIERS.filter((t) => t !== 'community').map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Months</label>
                <input type="number" min={1} max={120} value={compMonths} onChange={(e) => setCompMonths(Number(e.target.value))} className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <button onClick={compAccount} className="px-4 py-2 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-500">
                Grant Comp
              </button>
            </div>

            {/* Cancel / Reactivate */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm text-gray-300 mb-1">Cancel Reason</label>
                <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="Optional reason" />
              </div>
              <button onClick={() => cancelSub(false)} className="px-4 py-2 bg-orange-600 text-white rounded text-sm font-medium hover:bg-orange-500">
                Cancel at Period End
              </button>
              <button onClick={() => cancelSub(true)} className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-500">
                Cancel Immediately
              </button>
              <button onClick={reactivate} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-500">
                Reactivate
              </button>
            </div>
          </div>
        )}

        {/* ===== TRIAL TAB ===== */}
        {tab === 'trial' && (
          <div className="space-y-6">
            {/* Status banner */}
            {trial && (
              <div className={`rounded-lg p-4 ${trial.is_expired ? 'bg-red-900/30 border border-red-700' : 'bg-blue-900/30 border border-blue-700'}`}>
                <div className="text-sm text-gray-300 space-y-1">
                  <div>Trial Status: <span className="font-semibold text-white">{trial.trial_status || 'none'}</span></div>
                  <div>Days Remaining: <span className="font-semibold text-white">{trial.days_remaining}</span></div>
                  <div>Started: {trial.trial_started_at ? new Date(trial.trial_started_at).toLocaleDateString() : '-'}</div>
                  <div>Ends: {trial.trial_ends_at ? new Date(trial.trial_ends_at).toLocaleDateString() : '-'}</div>
                </div>
              </div>
            )}

            {/* Trial actions */}
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Action</label>
                <select value={trialAction} onChange={(e) => setTrialAction(e.target.value)} className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="extend">Extend</option>
                  <option value="shorten">Shorten</option>
                  <option value="end">End Now</option>
                  <option value="restart">Restart</option>
                  <option value="convert">Convert to Paid</option>
                </select>
              </div>
              {(trialAction === 'extend' || trialAction === 'shorten' || trialAction === 'restart') && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Days</label>
                  <input type="number" min={1} max={365} value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              )}
              {(trialAction === 'convert' || trialAction === 'restart') && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Tier</label>
                  <select value={trialConvertTier} onChange={(e) => setTrialConvertTier(e.target.value)} className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                    {VALID_TIERS.filter((t) => trialAction === 'restart' || t !== 'community').map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <button onClick={applyTrialAction} className="px-5 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-500">
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
