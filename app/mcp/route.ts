import { handleMCP } from '../../lib/server/mcp';
import { runtimeService } from '../../lib/server/runtime';

export const dynamic = 'force-dynamic';
export const POST = (request: Request) => handleMCP(request, runtimeService);
export const GET = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
