import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { bulkSetStatus } from '@/api/client';
import { chunk } from '@/lib/chunk';
import { mapWithConcurrency } from '@/lib/concurrency';
import type { Asset, AssetPage, AssetStatus } from '@/lib/types';

const BULK_CHUNK_SIZE = 50; // API hard cap
const BULK_CHUNK_CONCURRENCY = 3;
const MAX_CONFLICT_RETRIES = 2; // per-id retries for the ~7% random `conflict` failure

interface AssetsInfiniteData {
  pages: AssetPage[];
  pageParams: unknown[];
}

/** Applies a set of per-id replacements across every cached assets-list query. */
function mapAssetsInCache(queryClient: QueryClient, updates: Map<string, Asset>) {
  if (updates.size === 0) return;
  updates.forEach((asset) => queryClient.setQueryData(['asset', asset.id], asset));
  queryClient.setQueriesData<AssetsInfiniteData>({ queryKey: ['assets'] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((asset) => updates.get(asset.id) ?? asset),
      })),
    };
  });
}

export interface BulkStatusOutcome {
  applied: number;
  legalHoldFailed: string[];
  conflictFailed: string[]; // still failing after every retry
  notFound: string[];
  requestFailed: string[];
  retryableFailed: string[];
}

/**
 * Bulk status update: optimistic, chunked (<=50/request, 3 concurrent),
 * with per-id failure handling that treats API.md's two failure codes
 * differently rather than lumping them into one "failed" bucket:
 *
 *   - legal_hold: deterministic, will NEVER succeed for that asset.
 *     Never retried. Rolled back to its real prior status and reported
 *     by name so the user understands *why*, not just that it failed.
 *   - conflict: random, ~7%, genuinely worth retrying. Retried up to
 *     MAX_CONFLICT_RETRIES times before giving up and rolling back.
 *
 * All ids get the optimistic status immediately; anything that ultimately
 * fails (either kind) is rolled back to the real value it had before the
 * mutation started -- no id is left showing a status it never actually got.
 */
export function useBulkStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation<BulkStatusOutcome, Error, { ids: string[]; status: AssetStatus }>({
    mutationFn: async ({ ids, status }) => {
      const originals = new Map<string, Asset>();
      queryClient.getQueriesData<AssetsInfiniteData>({ queryKey: ['assets'] }).forEach(([, data]) => {
        data?.pages.forEach((page) =>
          page.items.forEach((asset) => {
            if (ids.includes(asset.id)) originals.set(asset.id, asset);
          }),
        );
      });

      const optimistic = new Map<string, Asset>();
      ids.forEach((id) => {
        const original = originals.get(id);
        if (original) optimistic.set(id, { ...original, status });
      });
      mapAssetsInCache(queryClient, optimistic);

      let pending = ids;
      let applied = 0;
      const legalHoldFailed = new Set<string>();
      const notFound = new Set<string>();
      const requestFailed = new Set<string>();
      let conflictFailed: string[] = [];

      for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES && pending.length > 0; attempt += 1) {
        const chunks = chunk(pending, BULK_CHUNK_SIZE);
        const chunkResults = await mapWithConcurrency(chunks, BULK_CHUNK_CONCURRENCY, async (idsChunk) => {
          try {
            return { ids: idsChunk, result: await bulkSetStatus(idsChunk, status) };
          } catch {
            return { ids: idsChunk, result: null };
          }
        });
        const results = chunkResults.flatMap((chunkResult) => {
          if (chunkResult.result) return chunkResult.result.results;
          chunkResult.ids.forEach((id) => requestFailed.add(id));
          return [];
        });

        const retryable: string[] = [];
        const succeeded = new Map<string, Asset>();

        results.forEach((result) => {
          if (result.ok) {
            applied += 1;
            succeeded.set(result.id, result.asset);
            requestFailed.delete(result.id);
            return;
          }
          requestFailed.delete(result.id);
          if (result.code === 'legal_hold') {
            legalHoldFailed.add(result.id);
          } else if (result.code === 'not_found') {
            notFound.add(result.id);
          } else {
            retryable.push(result.id); // conflict
          }
        });

        mapAssetsInCache(queryClient, succeeded);

        pending = retryable;
        conflictFailed = retryable;
      }

      const rollback = new Map<string, Asset>();
      const failedIds = [...legalHoldFailed, ...notFound, ...conflictFailed, ...requestFailed];
      failedIds.forEach((id) => {
        const original = originals.get(id);
        if (original) rollback.set(id, original);
      });
      mapAssetsInCache(queryClient, rollback);

      return {
        applied,
        legalHoldFailed: [...legalHoldFailed],
        conflictFailed,
        notFound: [...notFound],
        requestFailed: [...requestFailed],
        retryableFailed: [...new Set([...conflictFailed, ...requestFailed])],
      };
    },
  });
}