import { FitnessDashboard } from '@/components/fitness/dashboard';
import { taipeiToday } from '@/components/fitness/shared';
import { getChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getChatGPTUser();
  return <FitnessDashboard ownerKey={user?.userId ?? null} initialDate={taipeiToday()} />;
}
