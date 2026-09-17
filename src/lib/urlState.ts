import type { AssetQuery, AssetStatus } from './types';

export interface FilterState {
  q: string;
  status: AssetStatus[];
  sort: NonNullable<AssetQuery['sort']>;
}

const DEFAULT_SORT: FilterState['sort'] = 'updatedAt:desc';

export function readFilterStateFromUrl(search: string): FilterState {
  const params = new URLSearchParams(search);
  const status = params.get('status');
  const sort = params.get('sort');
  const q = params.get('q');
  return {
    q: q ?? '',
    status: status ? (status.split(',') as AssetStatus[]) : [],
    sort: (sort as FilterState['sort']) || DEFAULT_SORT,
  };
}

export function writeFilterStateToUrl(state: FilterState): void {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.status.length) params.set('status', state.status.join(','));
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  // replaceState, not pushState -- filters change on every keystroke, and
  // we don't want a browser-history entry per keystroke. Back/forward
  // still work because we listen for popstate separately.
  window.history.replaceState(null, '', url);
}