// @tier: community
import { redirect } from 'next/navigation';

// Merged into Settings > AI providers; kept as a redirect for old links and bookmarks.
export default function AiKeysRedirectPage() {
  redirect('/dashboard/settings/ai-providers');
}
