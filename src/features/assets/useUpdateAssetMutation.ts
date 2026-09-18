import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, updateAsset } from '@/api/client';
import type { Asset, AssetPage } from '@/lib/types';

interface AssetsInfiniteData {
  pages: AssetPage[];
  pageParams: unknown[];
}

function mapAssetInCache(queryClient: QueryClient, id: string, next: Asset) {
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
 * Fixes defect #6: saving in the detail panel previously had nowhere to put
 * the result, so the grid kept showing stale data until an unrelated
 * refetch happened to overwrite it. This writes the update straight into
 * the shared TanStack Query cache the grid reads from, so the two views
 * can never disagree.
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
    mutationFn: ({ id, version, patch }) => updateAsset(id, version, patch),

    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['assets'] });

      let previous: Asset | undefined;
      queryClient.getQueriesData<AssetsInfiniteData>({ queryKey: ['assets'] }).forEach(([, data]) => {
        data?.pages.forEach((page) => {
          const found = page.items.find((asset) => asset.id === id);
          if (found) previous = found;
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