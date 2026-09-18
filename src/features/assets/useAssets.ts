import { useInfiniteQuery } from '@tanstack/react-query';
import { listAssets } from '@/api/client';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { AssetQuery } from '@/lib/types';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 24;

/**
 * Cursor-paginated asset loader.
 *
 * `cursor` is deliberately NOT part of the query key (see API.md: cursors
 * are bound to the exact query that produced them). Instead it's the page
 * param -- so changing any filter produces a brand new queryKey and starts
 * a fresh pageParam sequence from scratch, which is exactly the "drop the
 * cursor whenever the query changes" rule the contract requires. There's no
 * way to accidentally reuse a stale cursor against a different filter set.
 */
export function useAssets(query: Omit<AssetQuery, 'cursor' | 'limit'>) {
  const debouncedQ = useDebouncedValue(query.q ?? '', SEARCH_DEBOUNCE_MS);
  const filters: Omit<AssetQuery, 'cursor' | 'limit'> = { ...query, q: debouncedQ.trim() };

  const {
    data,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
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
      },
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listAssets({ ...filters, cursor: pageParam, limit: PAGE_SIZE }, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // Keep prior pages' rows on screen while new filters load.
    placeholderData: (previousData) => previousData,
  });

  return {
    items: data ? data.pages.flatMap((page) => page.items) : [],
    // total is stable across pages of the same query -- API.md says it's
    // "the count for the current filters," recomputed identically each page.
    total: data?.pages[0]?.total ?? 0,
    loading: isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    error: error instanceof Error ? error.message : null,
  };
}