// @tier: community
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AuditRedirectPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'audit');
    router.replace(`/dashboard/settings?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}

export default function AuditRedirectPage() {
  return (
    <Suspense fallback={null}>
      <AuditRedirectPageInner />
    </Suspense>
  );
}
