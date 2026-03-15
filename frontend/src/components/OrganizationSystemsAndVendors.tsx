'use client';

import { useEffect, useState } from 'react';
import { organizationAPI } from '@/lib/api';

interface CotsProduct {
  id: string;
  product_name: string;
  vendor_name: string;
  lifecycle_status?: string;
}

interface SystemItem {
  id: string;
  system_name: string;
  system_description?: string | null;
}

interface OrganizationSystemsAndVendorsProps {
  canReadOrganization: boolean;
}

export default function OrganizationSystemsAndVendors({
  canReadOrganization,
}: OrganizationSystemsAndVendorsProps) {
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [cotsProducts, setCotsProducts] = useState<CotsProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canReadOrganization) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [sysRes, cotsRes] = await Promise.all([
          organizationAPI.getSystems().catch(() => ({ data: { data: [] } })),
          organizationAPI.getCotsProducts().catch(() => ({ data: { data: [] } })),
        ]);

        if (cancelled) return;

        setSystems(Array.isArray(sysRes.data?.data) ? sysRes.data.data : []);
        setCotsProducts(Array.isArray(cotsRes.data?.data) ? cotsRes.data.data : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [canReadOrganization]);

  if (!canReadOrganization) return null;

  if (loading) {
    return (
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse h-6 w-48 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Systems */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Systems</h3>
        {systems.length === 0 ? (
          <p className="text-sm text-gray-500">No systems registered yet.</p>
        ) : (
          <ul className="divide-y">
            {systems.map((s) => (
              <li key={s.id} className="py-2">
                <span className="font-medium text-gray-700">{s.system_name}</span>
                {s.system_description && (
                  <span className="ml-2 text-sm text-gray-400">— {s.system_description}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* COTS Products / Vendors */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">COTS Products &amp; Vendors</h3>
        {cotsProducts.length === 0 ? (
          <p className="text-sm text-gray-500">No products or vendors added yet.</p>
        ) : (
          <ul className="divide-y">
            {cotsProducts.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-700">{p.product_name}</span>
                  <span className="ml-2 text-sm text-gray-400">by {p.vendor_name}</span>
                </div>
                {p.lifecycle_status && (
                  <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                    {p.lifecycle_status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
