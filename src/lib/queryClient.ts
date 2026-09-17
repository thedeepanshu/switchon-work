import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime defaults to 0, which means fetched data becomes stale
      // immediately. A short staleTime lets React Query reuse recently
      // fetched data instead of refetching it on every mount/remount.
      //
      // 15s is long enough to avoid unnecessary refetches during quick
      // remounts or navigation while still allowing older data to refresh
      // on a later query mount. Filters are already part of queryKey.
      staleTime: 15_000,

      // Do not automatically refetch queries when the user returns to the tab.
      // This asset list does not need to refresh on every window-focus event.
      refetchOnWindowFocus: false,

      // Only retry failures ApiError.isRetryable says are worth retrying
      // (503, 429, 500/write_failed) -- never 400/409/422, which the API
      // contract guarantees will fail the same way every time.
      //
      // This is a basic exponential backoff, capped at 3 attempts. The
      // fuller resilience policy -- honoring Retry-After precisely, adding
      // jitter, detecting offline -- is Task 4; this is just "don't hammer
      // a request that can never succeed."
      retry: (failureCount, error) => {
        if (!(error instanceof ApiError)) return failureCount < 2;
        return error.isRetryable && failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
    },
  },
});