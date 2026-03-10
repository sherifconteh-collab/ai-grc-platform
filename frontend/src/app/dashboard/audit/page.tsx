// @tier: free
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuditRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/settings?tab=audit');
  }, [router]);
  return null;
}
