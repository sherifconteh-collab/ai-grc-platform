// @tier: community
import { redirect } from 'next/navigation';

// The CMDB hub is now the "Inventory by type" section of Assets; kept as a redirect for old links.
export default function CmdbRedirectPage() {
  redirect('/dashboard/assets#inventory');
}
