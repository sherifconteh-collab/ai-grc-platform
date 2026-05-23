import { redirect } from 'next/navigation';

export default async function AssetDetailRedirectPage({
  params,
}: {
  params: Promise<{ id?: string }> | { id?: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams?.id;

  if (!id) {
    redirect('/dashboard/assets');
  }

  redirect(`/dashboard/assets?assetId=${encodeURIComponent(id)}`);
}
