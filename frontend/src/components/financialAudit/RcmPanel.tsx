'use client';

import { useCallback, useEffect, useState } from 'react';
import { financialAuditAPI, type ControlFrequency, type RcmEntryInput, type RcmProcess } from '@/lib/api';
import { errorMessage, inputClass, Modal, primaryButton, secondaryButton } from '@/components/financialAudit/auditShared';
import { CsvInput, ErrorBanner, humanize, NoticeBanner, StatusPill } from '@/components/financialAudit/auditShared';

export interface RcmEntry {
  id: string;
  control_ref: string;
  process: RcmProcess;
  sub_process: string | null;
  risk_statement: string;
  control_description: string;
  assertions: string[];
  frequency: ControlFrequency;
  control_type: 'manual' | 'automated' | 'it_dependent_manual';
  control_nature: 'preventive' | 'detective';
  key_control: boolean;
  fraud_risk: boolean;
  risk_level: 'low' | 'moderate' | 'high';
  system_name: string | null;
  status: 'draft' | 'active' | 'retired';
  framework_code: string | null;
  framework_control_code: string | null;
  owner_name: string | null;
  latest_conclusion: string | null;
  latest_test_type: string | null;
}

export const PROCESSES: RcmProcess[] = ['procure_to_pay', 'order_to_cash', 'record_to_report', 'hire_to_retire', 'treasury', 'fixed_assets', 'inventory', 'budget_execution', 'it_general', 'entity_level', 'other'];
const ASSERTIONS = ['existence_occurrence', 'completeness', 'rights_obligations', 'valuation_allocation', 'presentation_disclosure', 'accuracy', 'cutoff'];
const FREQUENCIES: ControlFrequency[] = ['annual', 'quarterly', 'monthly', 'weekly', 'daily', 'recurring', 'as_needed'];

const TEMPLATE = 'control_ref,process,sub_process,assessable_unit,risk_ref,risk_statement,control_description,assertions,frequency,control_type,control_nature,key_control,fraud_risk,risk_level,system_name,framework_code,framework_control';

const EMPTY: RcmEntryInput = {
  control_ref: '', process: 'procure_to_pay', risk_statement: '', control_description: '', assertions: [],
  frequency: 'monthly', control_type: 'manual', control_nature: 'preventive', key_control: true, fraud_risk: false, risk_level: 'moderate', system_name: '',
};

function toForm(r: RcmEntry): RcmEntryInput {
  return {
    control_ref: r.control_ref, process: r.process, sub_process: r.sub_process, risk_statement: r.risk_statement,
    control_description: r.control_description, assertions: r.assertions, frequency: r.frequency, control_type: r.control_type,
    control_nature: r.control_nature, key_control: r.key_control, fraud_risk: r.fraud_risk, risk_level: r.risk_level, system_name: r.system_name,
  };
}

interface RcmPanelProps {
  canWrite: boolean;
  onPlanTest: (entry: RcmEntry) => void;
}

export default function RcmPanel({ canWrite, onPlanTest }: RcmPanelProps) {
  const [rows, setRows] = useState<RcmEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [process, setProcess] = useState('');
  const [search, setSearch] = useState('');
  const [keyOnly, setKeyOnly] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; form: RcmEntryInput } | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await financialAuditAPI.listRcm({ process: process || undefined, search: search || undefined, key_only: keyOnly || undefined, limit: 500 });
      setRows((res.data?.data || []) as RcmEntry[]);
      setTotal(res.data?.pagination?.total || 0);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load the risk-control matrix'));
    }
  }, [process, search, keyOnly]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      if (editing.id) {
        const { control_ref: _ref, ...changes } = editing.form;
        await financialAuditAPI.updateRcm(editing.id, changes);
      } else {
        await financialAuditAPI.createRcm(editing.form);
      }
      setEditing(null);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not save the control'));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (csv: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await financialAuditAPI.importRcm(csv);
      const r = res.data?.data as { created: number; updated: number; errors: { line: number; error: string }[] };
      setNotice(`Imported: ${r.created} added, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} rejected (first: line ${r.errors[0].line}, ${r.errors[0].error})` : ''}.`);
      setImporting(false);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Import failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: RcmEntry) => {
    if (!window.confirm(`Remove ${entry.control_ref}? Tested controls are retired rather than deleted.`)) return;
    try {
      await financialAuditAPI.deleteRcm(entry.id);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not remove the control'));
    }
  };

  const setField = <K extends keyof RcmEntryInput>(key: K, value: RcmEntryInput[K]) =>
    setEditing((prev) => (prev ? { ...prev, form: { ...prev.form, [key]: value } } : prev));

  return (
    <div>
      <ErrorBanner message={error} />
      <NoticeBanner message={notice} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm text-gray-700">Process
          <select className={`${inputClass} mt-1`} value={process} onChange={(e) => setProcess(e.target.value)}>
            <option value="">All processes</option>
            {PROCESSES.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">Search
          <input className={`${inputClass} mt-1`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference, control or risk" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
          <input type="checkbox" checked={keyOnly} onChange={(e) => setKeyOnly(e.target.checked)} /> Key controls only
        </label>
        <div className="flex-1" />
        {canWrite && (
          <>
            <button type="button" className={secondaryButton} onClick={() => setImporting(true)}>Import CSV</button>
            <button type="button" className={primaryButton} onClick={() => setEditing({ id: null, form: { ...EMPTY } })}>Add control</button>
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
            <tr>
              <th className="px-3 py-2">Ref</th>
              <th className="px-3 py-2">Process</th>
              <th className="px-3 py-2">Risk / control</th>
              <th className="px-3 py-2">Assertions</th>
              <th className="px-3 py-2">Frequency / type</th>
              <th className="px-3 py-2">Framework</th>
              <th className="px-3 py-2">Latest result</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No controls yet. Add them one at a time or import your existing matrix from CSV.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={r.status === 'retired' ? 'opacity-60' : ''}>
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                  {r.control_ref}
                  {r.key_control && <span className="ml-1 text-xs text-blue-700" title="Key control">KEY</span>}
                  {r.fraud_risk && <span className="ml-1 text-xs text-red-700" title="Addresses a fraud risk">FRAUD</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{humanize(r.process)}{r.sub_process ? <div className="text-xs text-gray-500">{r.sub_process}</div> : null}</td>
                <td className="px-3 py-2 max-w-md">
                  <div className="text-gray-900">{r.control_description}</div>
                  <div className="text-xs text-gray-500">Risk: {r.risk_statement}</div>
                </td>
                <td className="px-3 py-2 text-xs">{r.assertions.map(humanize).join(', ')}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{humanize(r.frequency)}<br />{humanize(r.control_type)}, {r.risk_level} risk</td>
                <td className="px-3 py-2 text-xs">{r.framework_code ? `${r.framework_code} ${r.framework_control_code}` : ''}</td>
                <td className="px-3 py-2"><StatusPill status={r.latest_conclusion} /></td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  {canWrite && r.status !== 'retired' && (
                    <>
                      <button type="button" className="text-blue-700 text-xs mr-3" onClick={() => onPlanTest(r)}>Test</button>
                      <button type="button" className="text-gray-700 text-xs mr-3" onClick={() => setEditing({ id: r.id, form: toForm(r) })}>Edit</button>
                      <button type="button" className="text-red-700 text-xs" onClick={() => remove(r)}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-2">{total} control(s)</p>

      {importing && (
        <Modal title="Import risk-control matrix" onClose={() => setImporting(false)} wide>
          <CsvInput
            busy={busy}
            onSubmit={runImport}
            help={<>Columns: <code className="break-all">{TEMPLATE}</code>. Assertions are separated by semicolons. Rows with an existing control_ref update it. framework_code plus framework_control (for example <code>fiscam,CWF-AC-03</code>) links a framework control.</>}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? `Edit ${editing.form.control_ref}` : 'Add control'} onClose={() => setEditing(null)} wide>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <label>Reference<input className={inputClass} value={editing.form.control_ref || ''} disabled={!!editing.id} onChange={(e) => setField('control_ref', e.target.value)} /></label>
            <label>Process
              <select className={inputClass} value={editing.form.process} onChange={(e) => setField('process', e.target.value as RcmProcess)}>
                {PROCESSES.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
              </select>
            </label>
            <label className="md:col-span-2">Risk statement<textarea className={inputClass} rows={2} value={editing.form.risk_statement || ''} onChange={(e) => setField('risk_statement', e.target.value)} /></label>
            <label className="md:col-span-2">Control description<textarea className={inputClass} rows={2} value={editing.form.control_description || ''} onChange={(e) => setField('control_description', e.target.value)} /></label>
            <label>Frequency
              <select className={inputClass} value={editing.form.frequency} onChange={(e) => setField('frequency', e.target.value as ControlFrequency)}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
              </select>
            </label>
            <label>Type
              <select className={inputClass} value={editing.form.control_type} onChange={(e) => setField('control_type', e.target.value as RcmEntryInput['control_type'])}>
                <option value="manual">Manual</option>
                <option value="automated">Automated</option>
                <option value="it_dependent_manual">IT-dependent manual</option>
              </select>
            </label>
            <label>Nature
              <select className={inputClass} value={editing.form.control_nature} onChange={(e) => setField('control_nature', e.target.value as RcmEntryInput['control_nature'])}>
                <option value="preventive">Preventive</option>
                <option value="detective">Detective</option>
              </select>
            </label>
            <label>Risk of failure
              <select className={inputClass} value={editing.form.risk_level} onChange={(e) => setField('risk_level', e.target.value as RcmEntryInput['risk_level'])}>
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>System<input className={inputClass} value={editing.form.system_name || ''} onChange={(e) => setField('system_name', e.target.value)} /></label>
            <div className="flex items-center gap-4 pt-5">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!editing.form.key_control} onChange={(e) => setField('key_control', e.target.checked)} /> Key control</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!editing.form.fraud_risk} onChange={(e) => setField('fraud_risk', e.target.checked)} /> Fraud risk</label>
            </div>
            <fieldset className="md:col-span-2">
              <legend className="mb-1">Assertions</legend>
              <div className="flex flex-wrap gap-3">
                {ASSERTIONS.map((a) => (
                  <label key={a} htmlFor={`assertion-${a}`} className="flex items-center gap-1">
                    <input
                      id={`assertion-${a}`}
                      type="checkbox"
                      checked={(editing.form.assertions || []).includes(a)}
                      onChange={(e) => setField('assertions', e.target.checked ? [...(editing.form.assertions || []), a] : (editing.form.assertions || []).filter((x) => x !== a))}
                    />
                    {humanize(a)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" className={secondaryButton} onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className={primaryButton} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
