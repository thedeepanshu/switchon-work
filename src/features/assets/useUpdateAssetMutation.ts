import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, updateAsset } from '@/api/client';
import type { Asset, AssetPage } from '@/lib/types';

interface AssetsInfiniteData {
  pages: AssetPage[];
  pageParams: unknown[];
}

function mapAssetInCache(queryClient: QueryClient, id: string, next: Asset) {
  queryClient.setQueryData<Asset>(['asset', id], next);
  queryClient.setQueriesData<AssetsInfiniteData>({ queryKey: ['assets'] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((asset) => (asset.id === id ? next : asset)),
      })),
    };
  });
}

interface UpdateAssetVars {
  id: string;
  version: number;
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>;
}

/**
 * Writes the update into the shared TanStack Query cache the grid reads from,
 * so the grid and detail panel stay synchronized after this mutation, subject
 * to later refetches or external updates.
 *
 * Optimistic, with rollback on any failure. 409 version_conflict gets no
 * special-cased retry here -- API.md says "No -- refetch first," and
 * blindly retrying with the same stale version would just 409 again. The
 * caller (AssetDetail) is responsible for refetching to get the current
 * version and letting the user decide whether to reapply their edit;
 * silently overwriting whatever changed elsewhere would defeat the point
 * of optimistic concurrency.
 */
export function useUpdateAssetMutation() {
  const queryClient = useQueryClient();

  return useMutation<Asset, ApiError, UpdateAssetVars, { previous: Asset | undefined }>({
    mutationKey: ['asset-update'],
    mutationFn: ({ id, version, patch }) => updateAsset(id, version, patch),

    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['assets'] });

      let previous = queryClient.getQueryData<Asset>(['asset', id]);
      queryClient.getQueriesData<AssetsInfiniteData>({ queryKey: ['assets'] }).forEach(([, data]) => {
        data?.pages.forEach((page) => {
          const found = page.items.find((asset) => asset.id === id);
          if (!previous && found) previous = found;
        });
      });

      if (previous) {
        mapAssetInCache(queryClient, id, { ...previous, ...patch });
      }

      return { previous };
    },

    onError: (_err, { id }, context) => {
      if (context?.previous) {
        mapAssetInCache(queryClient, id, context.previous);
      }
    },

    onSuccess: (updatedAsset) => {
      mapAssetInCache(queryClient, updatedAsset.id, updatedAsset);
    },
  });
}