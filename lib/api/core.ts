import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { resolveActiveSectorResult } from '@/lib/sectors/active-sector';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const scopes = ['read', 'send', 'contacts:write', 'webhooks:write'] as const;
export async function context(request: Request, scope = 'read', adminOnly = false) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ApiError(503, 'local_setup_required');
  const db = createAdminClient();
  const authorization = request.headers.get('authorization');
  if (authorization) {
    const match = /^Bearer (wis_[A-Za-z0-9_-]{40,})$/.exec(authorization);
    if (!match || adminOnly) throw new ApiError(401, 'invalid_token');
    const { data, error } = await db.from('wis_api_tokens').select('*').eq('token_hash', hash(match[1])).is('revoked_at', null).maybeSingle();
    if (error) throw new ApiError(503, 'database_unavailable');
    if (!data || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) throw new ApiError(401, 'invalid_token');
    if (!data.scopes.includes(scope)) throw new ApiError(403, 'insufficient_scope');
    return { db, sectorId: data.sector_id as string, tokenId: data.id as string | null, profileId: null as string | null, admin: false };
  }
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError(403, 'origin_required');
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new ApiError(401, 'authentication_required');
  const { data: profile } = await client.from('profiles').select('id,role').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  if (!profile || (adminOnly && profile.role !== 'admin')) throw new ApiError(403, 'forbidden');
  const sector = await resolveActiveSectorResult(client, profile.id);
  const sectorId = sector.ok ? sector.sector.id : sector.code === 'bootstrap' ? sector.sectorId : null;
  if (!sectorId) throw new ApiError(409, 'select_sector');
  return { db, sectorId, tokenId: null as string | null, profileId: profile.id as string | null, admin: profile.role === 'admin' };
}
export function endpoint(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try { return await fn(request); } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ error: error instanceof ApiError ? error.message : 'internal_error' }, { status, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
export const result = (data: unknown, status = 200) => Response.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } });
export async function body(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 65536) throw new ApiError(413, 'body_too_large');
  try { const data = JSON.parse(raw); if (!data || typeof data !== 'object' || Array.isArray(data)) throw 0; return data; } catch { throw new ApiError(400, 'invalid_json'); }
}
export function check(error: unknown) { if (error) throw new ApiError(503, 'database_error'); }
export function uuid(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiError(400, 'invalid_id'); return value; }
