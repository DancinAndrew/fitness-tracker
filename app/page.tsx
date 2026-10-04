import { FitnessDashboard } from '@/components/fitness/dashboard';
import { taipeiToday } from '@/components/fitness/shared';
import { getChatGPTUser } from './chatgpt-auth';
export default async function Home() {
  const user = await getChatGPTUser();
  return <FitnessDashboard ownerKey={user?.userId ?? null} initialDate={taipeiToday()} />;
}
