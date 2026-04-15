import { requireUser } from '@/lib/auth';
import OnboardingFlow from './OnboardingFlow';

export default async function OnboardingPage() {
  const user = await requireUser();
  return <OnboardingFlow user={user} />;
}
