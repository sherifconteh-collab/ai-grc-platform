'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { evidenceAPI, risksAPI } from '@/lib/api';

/**
 * Evidence attached to a risk.
 *
 * The writing end of migration 149. Evidence could already be linked to
 * controls, so a risk's evidence was only reachable transitively -- via its
 * controls, and only when those controls happened to carry the document. "Show
 * me this risk is under management" is a different question from "show me these
 * controls exist", and this answers it directly.
 *
 * `relevance` is on the link rather than on the evidence because the same file
 * supports different risks for different reasons: a penetration test report is
 * assessment evidence for one risk and monitoring evidence for another.
 */

const RELEVANCE = [
  { value: 'assessment', label: 'Assessment', hint: 'how the risk was scored' },
  { value: 'treatment', label: 'Treatment', hint: 'what is being done about it' },
  { value: 'monitoring', label: 'Monitoring', hint: 'ongoing proof it stays in appetite' },
  { value: 'acceptance', label: 'Acceptance', hint: 'the decision record' },
] as const;

type Relevance = typeof RELEVANCE[number]['value'];

const RELEVANCE_STYLES: Record<string, string> = {
  assessment: 'bg-blue-100 text-blue-700',
  treatment: 'bg-purple-100 text-purple-700',
  monitoring: 'bg-green-100 text-green-700',
  acceptance: 'bg-amber-100 text-amber-800',
};

// Evidence carries a PII classification; surface it before someone attaches a
// restricted document to a risk file that gets exported.
const PII_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  moderate: 'bg-yellow-100 text-yellow-700',
};

interface LinkedEvidence {
  id: string;
  evidence_id: string;
  relevance: string;
  notes: string | null;
  file_name: string | null;
  description: string | null;
  evidence_type: string | null;
  pii_classification: string | null;
  // This repo dates evidence expiry with retention_until (migration 012). The
  // sibling repo's expires_at belongs to legal_holds here and does not exist
  // on evidence.
  retention_until: string | null;
}

interface EvidenceOption {
  id: string;
  file_name: string | null;
  description: string | null;
}

interface RiskEvidenceLinksProps {
  riskId: string;
  linked: LinkedEvidence[];
  canWrite: boolean;
  onChanged: () => void;
}

export default function RiskEvidenceLinks({
  riskId, linked, canWrite, onChanged,
}: RiskEvidenceLinksProps) {
  const [adding, setAdding] = useState(false);
  const [catalog, setCatalog] = useState<EvidenceOption[]>([]);
  const [choice, setChoice] = useState('');
  const [relevance, setRelevance] = useState<Relevance>('monitoring');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCatalog = useCallback(async () => {
    try {
      const res = await evidenceAPI.getAll({ limit: 200 });
      const data = res.data?.data ?? res.data ?? [];
      setCatalog(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load the evidence library.');
    }
  }, []);

  useEffect(() => {
    if (adding && catalog.length === 0) loadCatalog();
  }, [adding, catalog.length, loadCatalog]);

  const linkedIds = useMemo(
    () => new Set(linked.map((row) => row.evidence_id)),
    [linked]
  );

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalog
      .filter((item) => !linkedIds.has(item.id))
      .filter((item) => !term
        || (item.file_name || '').toLowerCase().includes(term)
        || (item.description || '').toLowerCase().includes(term))
      .slice(0, 100);
  }, [catalog, linkedIds, search]);

  const link = async () => {
    if (!choice) return;
    setBusy(true); setError('');
    try {
      await risksAPI.linkEvidence(riskId, { evidenceId: choice, relevance });
      setChoice(''); setSearch(''); setRelevance('monitoring'); setAdding(false);
      onChanged();
    } catch {
      setError('Could not attach that evidence.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (evidenceId: string) => {
    setBusy(true); setError('');
    try {
      await risksAPI.unlinkEvidence(riskId, evidenceId);
      onChanged();
    } catch {
      setError('Could not detach that evidence.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Evidence</h2>
        {canWrite && (
          <button
            onClick={() => setAdding((open) => !open)}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            {adding ? 'Cancel' : '+ Attach evidence'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {adding && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search evidence by file name or description"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-label="Document to attach to this risk"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">Select a document…</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.file_name || item.description || item.id}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={relevance}
              onChange={(e) => setRelevance(e.target.value as Relevance)}
              aria-label="Why this document is evidence for this risk"
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {RELEVANCE.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label} — {entry.hint}
                </option>
              ))}
            </select>
            <button
              onClick={link}
              disabled={!choice || busy}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              Attach
            </button>
          </div>
        </div>
      )}

      {linked.length === 0 ? (
        <p className="text-sm text-gray-400">
          No evidence attached. Controls linked to this risk may carry their own evidence,
          but that shows the controls exist — not that this risk is under management.
        </p>
      ) : (
        <ul role="list" className="space-y-2">
          {linked.map((row) => (
            <li key={row.id} role="listitem" className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-gray-900 font-medium truncate">
                    {row.file_name || row.description || 'Untitled document'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      RELEVANCE_STYLES[row.relevance] || 'bg-gray-100 text-gray-600'
                    }`}>
                      {RELEVANCE.find((e) => e.value === row.relevance)?.label ?? row.relevance}
                    </span>
                    {row.evidence_type && (
                      <span className="text-xs text-gray-500">{row.evidence_type}</span>
                    )}
                    {row.pii_classification && PII_STYLES[row.pii_classification] && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PII_STYLES[row.pii_classification]}`}>
                        PII: {row.pii_classification}
                      </span>
                    )}
                    {row.retention_until && (
                      <span className="text-xs text-gray-500">
                        retained until {new Date(row.retention_until).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <button
                    onClick={() => unlink(row.evidence_id)}
                    disabled={busy}
                    className="text-xs text-red-500 hover:text-red-700 shrink-0"
                  >
                    Detach
                  </button>
                )}
              </div>
              {row.notes && <p className="mt-1 text-xs text-gray-600">{row.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
