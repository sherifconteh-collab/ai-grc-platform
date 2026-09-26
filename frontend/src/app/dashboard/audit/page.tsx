// @tier: community
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AuditRedirectPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/dashboard/settings/audit-log${qs ? `?${qs}` : ''}`);
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
