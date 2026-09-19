import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

/**
 * Offline detection is NOT hand-rolled here: TanStack Query's onlineManager
 * listens to the browser's online/offline events out of the box. With the
 * default networkMode ('online'), queries and mutations simply don't fire
 * while offline -- they sit in a "paused" state instead of failing and
 * burning retry attempts -- and automatically resume when the browser
 * reports it's back online. There's nothing to configure for the
 * mechanism itself; useOnlineStatus (src/lib/useOnlineStatus.ts) only exists to surface
 * that state visibly in the UI (App.tsx's offline banner), since silently
 * pausing with no indication would just look like the app hanging.
 */
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

      // Two different policies depending on whether the server told us
      // how long to wait:
      //   - Retry-After present (503/429 both send it): treated as a
      //     FLOOR, not a target -- we add a little jitter on top, never
      //     below it, since the server said "at minimum this long."
      //   - No Retry-After: exponential backoff with FULL jitter (random
      //     between 0 and the cap) -- this is what actually prevents a
      //     thundering herd when several requests fail at the same
      //     moment, which a fixed exponential curve alone does not.
      retryDelay: (attemptIndex, error) => {
        if (error instanceof ApiError && error.retryAfterSeconds != null) {
          return error.retryAfterSeconds * 1000 + Math.random() * 500;
        }
        const cap = Math.min(1000 * 2 ** attemptIndex, 10_000);
        return Math.random() * cap;
      },
    },
  },
});