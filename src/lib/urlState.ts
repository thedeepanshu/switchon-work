import type { AssetKind, AssetQuery, AssetStatus } from './types';

export interface FilterState {
  q: string;
  status: AssetStatus[];
  kind: AssetKind[];
  sort: NonNullable<AssetQuery['sort']>;
}

const DEFAULT_SORT: FilterState['sort'] = 'updatedAt:desc';

export function readFilterStateFromUrl(search: string): FilterState {
  const params = new URLSearchParams(search);
  const status = params.get('status');
  const kind = params.get('kind');
  const sort = params.get('sort');
  // Trim defensively on read too, in case an old/shared link has a
  // whitespace-only q from before this fix.
  const q = (params.get('q') ?? '').trim();
  
  return {
    q,
    status: status ? (status.split(',') as AssetStatus[]) : [],
    kind: kind ? (kind.split(',') as AssetKind[]) : [],
    sort: (sort as FilterState['sort']) || DEFAULT_SORT,
  };
}

export function writeFilterStateToUrl(state: FilterState): void {
  const params = new URLSearchParams();
  // A whitespace-only search (" ", "   ") is not a search -- trim before
  // the truthy check, or `if (state.q)` treats "   " as a real query and
  // URLSearchParams encodes it as the very confusing `q=+++`.
  const q = state.q.trim();
  if (q) params.set('q', q);
  if (state.status.length) params.set('status', state.status.join(','));
  if (state.kind.length) params.set('kind', state.kind.join(','));
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  window.history.replaceState(null, '', url);
}