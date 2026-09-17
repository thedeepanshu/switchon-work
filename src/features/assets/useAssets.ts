import { useQuery } from '@tanstack/react-query';
import { listAssets } from '@/api/client';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { AssetQuery } from '@/lib/types';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * First-page asset loader.
 *
 * Fixes, vs. the old hand-rolled version:
 *   - `q` is debounced, so typing no longer fires a request per keystroke
 *   - queryFn receives TanStack Query's AbortSignal, so changing filters
 *     mid-flight cancels the now-irrelevant in-flight request instead of
 *     leaving it to land later
 *   - the race is fixed structurally: everything the response depends on
 *     is in `queryKey`, and TanStack Query only ever commits the result for
 *     the *current* key -- there's no manual "is this response still
 *     relevant" bookkeeping to get wrong
 *   - identical concurrent requests (e.g. two components asking for the
 *     same filters) are deduped automatically by the query cache
 *
 * Does NOT yet do pagination -- this always fetches page one. Task 2
 * replaces this with useInfiniteQuery once the grid actually consumes
 * multiple pages; building that now would just be dead code until then.
 */

export function useAssets(query: Omit<AssetQuery, 'cursor'>) {
  const debouncedQ = useDebouncedValue(query.q ?? '', SEARCH_DEBOUNCE_MS);
  const filters: Omit<AssetQuery, 'cursor'> = { ...query, q: debouncedQ };

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: [
      'assets',
      {
        q: filters.q,
        status: filters.status,
        kind: filters.kind,
        tag: filters.tag,
        collectionId: filters.collectionId,
        owner: filters.owner,
        sort: filters.sort,
        limit: filters.limit,
      },
    ],
    queryFn: ({ signal }) => listAssets(filters, { signal }),
    // Keep the previous page's rows on screen while the new filters load,
    // instead of flashing to an empty grid on every change.
    placeholderData: (previousData) => previousData,
  });

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    nextCursor: data?.nextCursor ?? null,
    // True only on the very first load with nothing cached yet.
    loading: isPending,
    // True whenever a fetch is in flight, including background refetches
    // while placeholder data is still showing -- use this for a subtle
    // "updating" indicator rather than blanking the screen.
    isFetching,
    error: error instanceof Error ? error.message : null,
  };
}