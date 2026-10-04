import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAPI } from '../lib/server/http.ts';
import { handleMCP } from '../lib/server/mcp.ts';
import type { LedgerService } from '../lib/contracts.ts';

const headers = { 'content-type': 'application/json', 'oai-authenticated-user-id': 'synthetic-owner', 'oai-authenticated-user-email': 'owner@example.test' };
const request = (path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) => new Request(`https://fitness.test${path}`, { method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const forbidden = () => { throw new Error('Service must not be instantiated'); };

test('S03 REST anonymous access is rejected before database access', async () => {
  const response = await handleAPI(new Request('https://fitness.test/api/v1/settings'), forbidden);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('cache-control')!, /no-store/);
});

test('S03 cross-site and invalid JSON writes are rejected', async () => {
  const factory = () => ({} as LedgerService);
  assert.equal((await handleAPI(request('/api/v1/records', 'POST', {}, { origin: 'https://evil.test' }), factory)).status, 403);
  assert.equal((await handleAPI(new Request('https://fitness.test/api/v1/records', { method: 'POST', headers, body: '{broken' }), factory)).status, 400);
  assert.equal((await handleAPI(request('/api/v1/records', 'POST', { text: 'x'.repeat(131073) }), factory)).status, 413);
});

test('S03 user identity comes only from trusted dispatch headers; query keys validated', async () => {
  const seen: string[] = [];
  const factory = () => ({ getSettings: async (id: string) => { seen.push(id); return { revision: 0 }; } } as unknown as LedgerService);
  assert.equal((await handleAPI(request('/api/v1/settings?user_id=another'), factory)).status, 422);
  assert.equal((await handleAPI(request('/api/v1/settings'), factory)).status, 200);
  assert.deepEqual(seen, ['synthetic-owner']);
  assert.equal((await handleAPI(request('/api/v1/dashboard?date=2026-02-30'), factory)).status, 422);
  assert.equal((await handleAPI(request('/api/v1/dashboard?date=2026-01-01&date=2026-02-01'), factory)).status, 400);
});

test('S05 persistence failures are safe and never report successful save', async () => {
  const factory = () => ({ getSettings: async () => { throw new Error('SQL/private record/secret'); } } as unknown as LedgerService);
  const response = await handleAPI(request('/api/v1/settings'), factory);
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.ok(!body.includes('SQL') && !body.includes('secret'));
});

test('MCP discovery exposes exact record schema and no personal data', async () => {
  const response = await handleMCP(request('/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }), forbidden);
  const { result } = await response.json() as { result: { tools: { name: string; inputSchema: { properties: Record<string, unknown> }; annotations: { readOnlyHint: boolean } }[] } };
  assert.equal(result.tools.length, 10);
  const create = result.tools.find(t => t.name === 'health_create_record')!;
  assert.ok(create.inputSchema.properties.record);
  assert.equal(create.annotations.readOnlyHint, false);
  assert.ok(!JSON.stringify(result).includes('synthetic-owner'));
});

test('MCP unauthenticated data calls fail before service access', async () => {
  const response = await handleMCP(new Request('https://fitness.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'health_get_settings', arguments: {} } }) }), forbidden);
  assert.equal(response.status, 401);
});

test('MCP valid call uses same service; invalid values never reach service', async () => {
  let calls = 0;
  const factory = () => ({ dashboard: async (user: string, date: string) => { calls++; return { user, date }; } } as unknown as LedgerService);
  const body = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'health_dashboard', arguments: { date: '2026-10-04' } } };
  const result = await (await handleMCP(request('/mcp', 'POST', body), factory)).json() as { result: { isError: boolean; structuredContent: { data: { date: string } } } };
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.data.date, '2026-10-04');
  body.params.arguments.date = 'unknown';
  const invalid = await (await handleMCP(request('/mcp', 'POST', body), factory)).json() as { error: unknown };
  assert.ok(invalid.error);
  assert.equal(calls, 1);
});

test('MCP client metadata is accepted without becoming a tool argument or identity', async () => {
  const seen: string[] = [];
  const factory = () => ({ getSettings: async (user: string) => { seen.push(user); return { revision: 0 }; } } as unknown as LedgerService);
  const body = { jsonrpc: '2.0', id: 'metadata-call', method: 'tools/call', params: { name: 'health_get_settings', arguments: {}, _meta: { progressToken: 'synthetic-progress', user_id: 'another-owner' } } };
  const response = await handleMCP(request('/mcp', 'POST', body), factory);
  const result = await response.json() as { id: string; result: { isError: boolean; structuredContent: { data: { revision: number } } } };
  assert.equal(result.id, 'metadata-call');
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.data.revision, 0);
  assert.deepEqual(seen, ['synthetic-owner']);
});

test('MCP metadata does not relax strict health arguments or anonymous access', async () => {
  const body = { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'health_get_settings', arguments: { user_id: 'another-owner' }, _meta: { progressToken: 9 } } };
  const invalid = await (await handleMCP(request('/mcp', 'POST', body), forbidden)).json() as { error: { data: { stage: string } } };
  assert.equal(invalid.error.data.stage, 'arguments');
  const anonymous = new Request('https://fitness.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await handleMCP(anonymous, forbidden)).status, 401);
});
