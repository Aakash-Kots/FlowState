'use client';

import { useRouter } from 'next/navigation';
import { ConnectScreen } from '@/components/ConnectScreen';
import { useOnboardingSync } from '@/lib/onboarding';

// The Connect screen as a standalone route (the Settings/Connect tab). Reachable
// any time; "Done" returns to the workspace shell.
export default function ConnectPage() {
  useOnboardingSync();
  const router = useRouter();
  return <ConnectScreen onClose={() => router.push('/')} />;
}
