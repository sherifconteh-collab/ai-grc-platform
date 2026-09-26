// @tier: enterprise
import { redirect } from 'next/navigation';

// Merged into Third-Party Risk as the Contracts tab; kept as a redirect for old links and bookmarks.
export default function VendorRiskRedirectPage() {
  redirect('/dashboard/tprm?tab=contracts');
}
