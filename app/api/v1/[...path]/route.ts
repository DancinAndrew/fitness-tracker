import { handleAPI } from '../../../../lib/server/http';
import { runtimeService } from '../../../../lib/server/runtime';

export const dynamic = 'force-dynamic';
const handle = (request: Request) => handleAPI(request, runtimeService);
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
