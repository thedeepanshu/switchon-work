import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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