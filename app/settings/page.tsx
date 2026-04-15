import { requireUser } from '@/lib/auth';
import DashboardLayout from '@/components/DashboardLayout';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <DashboardLayout user={user} title="Instellingen">
      <SettingsClient user={user} />
    </DashboardLayout>
  );
}
