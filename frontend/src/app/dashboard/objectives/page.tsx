// @tier: community
'use client';

/**
 * /dashboard/objectives is now a tab of the consolidated organization-structure
 * page. Kept as a redirect rather than deleted so bookmarks, docs and any
 * external links still land somewhere useful — the same pattern
 * dashboard/audit uses after it folded into settings.
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ObjectivesRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'objectives');
    router.replace(`/dashboard/structure?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}

export default function ObjectivesRedirectPage() {
  return (
    <Suspense fallback={null}>
      <ObjectivesRedirectInner />
    </Suspense>
  );
}
