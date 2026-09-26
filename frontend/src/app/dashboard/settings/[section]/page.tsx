// @tier: community
import { notFound } from 'next/navigation';
import SettingsScreen from '@/components/settings/SettingsScreen';
import { SETTINGS_SECTIONS, sectionForSlug } from '@/lib/settingsSections';

interface SettingsSectionPageProps {
  params: Promise<{ section: string }>;
}

export function generateStaticParams() {
  return SETTINGS_SECTIONS.map((s) => ({ section: s.slug }));
}

export default async function SettingsSectionPage({ params }: SettingsSectionPageProps) {
  const { section } = await params;
  if (!sectionForSlug(section)) notFound();
  return <SettingsScreen section={section} />;
}
