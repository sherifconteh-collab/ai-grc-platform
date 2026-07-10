'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trustCenterAPI } from '@/lib/api';

interface ComplianceScore {
  framework_name: string;
  compliance_pct: number;
  as_of: string;
}

interface TrustCenterPublicData {
  display_name: string;
  description: string | null;
  contact_email: string | null;
  published_at: string | null;
  frameworks?: string[];
  compliance_scores?: ComplianceScore[];
  active_authorizations?: number;
}

export default function TrustCenterPublicPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<TrustCenterPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const response = await trustCenterAPI.getPublicPage(token);
        if (cancelled) return;
        if (response?.success && response?.data) {
          setData(response.data);
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (token) {
      load();
    } else {
      setNotFound(true);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">Loading Trust Center...</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Not Found</h1>
          <p className="text-sm text-gray-600 mb-6">
            This Trust Center page could not be found.
          </p>
          <Link href="/" className="text-purple-600 hover:underline text-sm font-medium">
            Back to ControlWeave
          </Link>
        </div>
      </div>
    );
  }

  const frameworks = data.frameworks ?? [];
  const scores = data.compliance_scores ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">{data.display_name}</h1>
          {data.description && (
            <p className="text-gray-600 leading-relaxed mb-6">{data.description}</p>
          )}

          {data.contact_email && (
            <p className="text-sm text-gray-500 mb-8">
              Contact:{' '}
              <a href={`mailto:${data.contact_email}`} className="text-purple-600 hover:underline">
                {data.contact_email}
              </a>
            </p>
          )}

          {scores.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Compliance Scores</h2>
              <ul role="list" className="space-y-4">
                {scores.map((score) => (
                  <li role="listitem" key={score.framework_name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-gray-800">{score.framework_name}</span>
                      <span className="text-gray-500">{Math.round(score.compliance_pct)}%</span>
                    </div>
                    <div
                      className="h-2 w-full rounded-full bg-gray-100 overflow-hidden"
                      role="progressbar"
                      aria-label={`${score.framework_name} compliance: ${Math.round(score.compliance_pct)}%`}
                      aria-valuenow={Math.round(score.compliance_pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full bg-purple-600 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, score.compliance_pct))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {frameworks.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Frameworks</h2>
              <ul role="list" className="flex flex-wrap gap-2">
                {frameworks.map((name) => (
                  <li role="listitem" key={name}>
                    <span className="inline-block bg-purple-50 text-purple-700 border border-purple-100 text-xs font-medium px-3 py-1 rounded-full">
                      {name}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {typeof data.active_authorizations === 'number' && (
            <section className="mb-8">
              <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <span className="text-2xl font-bold text-gray-900">{data.active_authorizations}</span>
                <span className="text-sm text-gray-600">Active Authorizations</span>
              </div>
            </section>
          )}

          {data.published_at && (
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
              Published: {new Date(data.published_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
