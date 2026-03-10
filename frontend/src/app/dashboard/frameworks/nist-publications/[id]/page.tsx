'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';

export default function LegacyNistPublicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const publicationId = String(params?.id || '');

  useEffect(() => {
    if (!publicationId) return;
    router.replace(`/dashboard/frameworks/publications/${publicationId}`);
  }, [publicationId, router]);

  return (
    <DashboardLayout>
      <div className="py-16 text-center text-gray-500">
        Redirecting to the publication workspace...
      </div>
    </DashboardLayout>
  );
}
