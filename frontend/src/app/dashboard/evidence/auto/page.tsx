import { redirect } from 'next/navigation';

export default function AutoEvidencePage() {
  redirect('/dashboard/evidence?tab=auto');
}
