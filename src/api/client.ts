import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';

/**
 * Baseline client. It works on a good network and falls apart on a bad one.
 *
 * Known gaps, all of which are yours to close:
 *   - no request cancellation (signal is now threaded through -- see below --
 *     but nothing passes one yet; that lands with the Task 1 fetch rewrite)
 *   - no retry, no backoff, no handling of Retry-After (Task 4)
 *   - no de-duplication of concurrent identical requests (Task 1)
 */

export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'too_many_ids'
  | 'stale_cursor'
  | 'version_conflict'
  | 'invalid_name'
  | 'invalid_status'
  | 'invalid_tags'
  | 'legal_hold'
  | 'write_failed'
  | 'upstream_unavailable'
  | 'rate_limited'
  | 'thumbnail_missing'
  | 'unknown';

/**
 * Structured replacement for the old "flatten everything into a string"
 * behavior. Callers branch on `status`/`code`, never on `message` -- the
 * API contract guarantees `code` is stable, `message` is just for humans.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: string | undefined,
    message: string,
    retryAfterSeconds: number | null,
    requestId: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = (code as ApiErrorCode | undefined) ?? 'unknown';
    this.retryAfterSeconds = retryAfterSeconds;
    this.requestId = requestId;
  }

  /**
   * Whether this whole-request failure is safe to retry, per API.md's retry
   * matrix. Deliberately structural (status + code), never string-matched:
   *   - 503 upstream_unavailable -> retry
   *   - 429 (any body)           -> retry, but retries themselves count
   *                                 against the rate limit -- callers must
   *                                 still back off
   *   - 500 write_failed         -> retry
   *   - 400 / 409 / 422          -> never retry
   *
   * Bulk per-item codes (`legal_hold` vs `conflict`) live inside a 207
   * response body, not here -- that distinction is handled separately in
   * Task 3, since it's per-id, not per-request.
   */
  get isRetryable(): boolean {
    if (this.status === 429) return true;
    if (this.status === 503) return true;
    if (this.status === 500 && this.code === 'write_failed') return true;
    return false;
  }
}

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.kind?.length) params.set('kind', query.kind.join(','));
  if (query.tag?.length) params.set('tag', query.tag.join(','));
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return params.toString();
}

function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });

  const requestId = res.headers.get('x-request-id');

  if (!res.ok) {
    let code: string | undefined;
    let message = res.statusText;
    try {
      const body = await res.json();
      code = body?.error?.code;
      message = body?.error?.message ?? message;
    } catch {
      /* response was not JSON */
    }
    throw new ApiError(res.status, code, message, parseRetryAfter(res.headers.get('retry-after')), requestId);
  }

  return res.json() as Promise<T>;
}

export function listAssets(query: AssetQuery, opts?: { signal?: AbortSignal }): Promise<AssetPage> {
  return request<AssetPage>(`/api/assets?${toSearchParams(query)}`, { signal: opts?.signal });
}

export function getAsset(id: string, opts?: { signal?: AbortSignal }): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, { signal: opts?.signal });
}

export function getAssetsByIds(
  ids: string[],
  opts?: { signal?: AbortSignal },
): Promise<{ items: Asset[]; missing: string[] }> {
  // Note: the endpoint rejects more than 25 ids per call.
  return request(`/api/assets/batch?ids=${ids.join(',')}`, { signal: opts?.signal });
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, patch }),
  });
}

export function bulkSetStatus(ids: string[], status: Asset['status']): Promise<BulkResult> {
  // Note: the endpoint rejects more than 50 ids per call.
  return request<BulkResult>('/api/assets/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
  });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
