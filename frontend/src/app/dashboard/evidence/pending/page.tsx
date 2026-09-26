import { redirect } from 'next/navigation';

export default function PendingEvidencePage() {
  redirect('/dashboard/evidence?tab=pending');
}
