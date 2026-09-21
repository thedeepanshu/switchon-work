import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { useAssets } from '@/features/assets/useAssets';
import { useBulkStatusMutation } from '@/features/assets/useBulkStatusMutation';
import { statusLabel } from '@/lib/format';
import { readFilterStateFromUrl, writeFilterStateToUrl } from '@/lib/urlState';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import type { Asset, AssetKind, AssetStatus, AssetQuery } from '@/lib/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const KINDS: AssetKind[] = ['image', 'video', 'document'];
const KIND_LABELS: Record<AssetKind, string> = {
  image: 'Images',
  video: 'Videos',
  document: 'Documents',
};
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

export function App() {
  const [q, setQ] = useState(() => readFilterStateFromUrl(window.location.search).q);
  const [status, setStatus] = useState<AssetStatus[]>(
    () => readFilterStateFromUrl(window.location.search).status,
  );
  const [kind, setKind] = useState<AssetKind[]>(
    () => readFilterStateFromUrl(window.location.search).kind,
  );
  const [sort, setSort] = useState<NonNullable<AssetQuery['sort']>>(
    () => readFilterStateFromUrl(window.location.search).sort,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryableBulkIds, setRetryableBulkIds] = useState<string[]>([]);
  const [lastBulkStatus, setLastBulkStatus] = useState<AssetStatus | null>(null);
  const [resultAnnouncement, setResultAnnouncement] = useState('');
  const typeMenuRef = useRef<HTMLDetailsElement>(null);
  const sortMenuRef = useRef<HTMLDetailsElement>(null);

  const selectedSortLabel = SORTS.find((option) => option.value === sort)?.label ?? 'Sort';

  useEffect(() => {
    function closeMenusOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!typeMenuRef.current?.contains(target)) typeMenuRef.current?.removeAttribute('open');
      if (!sortMenuRef.current?.contains(target)) sortMenuRef.current?.removeAttribute('open');
    }

    document.addEventListener('pointerdown', closeMenusOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeMenusOnOutsideClick);
  }, []);

  useEffect(() => {
    writeFilterStateToUrl({ q, status, kind, sort });
  }, [q, status, kind, sort]);

  useEffect(() => {
    function onPopState() {
      const next = readFilterStateFromUrl(window.location.search);
      setQ(next.q);
      setStatus(next.status);
      setKind(next.kind);
      setSort(next.sort);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const { items, total, loading, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage, error } =
    useAssets({
      q,
      status,
      kind,
      sort,
    });

  useEffect(() => {
    if (!isFetching) {
      setResultAnnouncement(`${items.length} of ${total.toLocaleString()} assets shown`);
    }
  }, [isFetching, items.length, total]);

  const bulkStatusMutation = useBulkStatusMutation();
  const online = useOnlineStatus();

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lastClickedIdRef = useRef<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const toggleSelect = useCallback((id: string, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIdRef.current) {
        const currentItems = itemsRef.current;
        const fromIndex = currentItems.findIndex((a) => a.id === lastClickedIdRef.current);
        const toIndex = currentItems.findIndex((a) => a.id === id);
        if (fromIndex !== -1 && toIndex !== -1) {
          const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
          for (let i = start; i <= end; i += 1) next.add(currentItems[i]!.id);
          lastClickedIdRef.current = id;
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      lastClickedIdRef.current = id;
      return next;
    });
  }, []);

  const selectAllLoaded = useCallback(() => {
    setSelectedIds(new Set(itemsRef.current.map((a) => a.id)));
  }, []);

  const openDetail = useCallback((id: string) => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setActiveId(id);
  }, []);

  const closeDetail = useCallback(() => {
    setActiveId(null);
    previousFocusRef.current?.focus();
  }, []);

  async function applyBulkStatus(next: AssetStatus, idsOverride?: string[]) {
    const ids = idsOverride ?? [...selectedIds];
    if (ids.length === 0) return;
    setNotice(null);
    setRetryableBulkIds([]);
    setLastBulkStatus(next);
    setUpdatingIds(new Set(ids));

    try {
      const outcome = await bulkStatusMutation.mutateAsync({ ids, status: next });
      const parts = [`${outcome.applied} updated`];
      if (outcome.legalHoldFailed.length) {
        parts.push(`${outcome.legalHoldFailed.length} on legal hold (can't be changed)`);
      }
      if (outcome.conflictFailed.length) {
        parts.push(`${outcome.conflictFailed.length} still conflicting after retries -- try again`);
      }
      if (outcome.notFound.length) {
        parts.push(`${outcome.notFound.length} no longer exist`);
      }
      if (outcome.requestFailed.length) {
        parts.push(`request failed for ${outcome.requestFailed.join(', ')}`);
      }
      if (outcome.retryableFailed.length) {
        parts.push(`retryable failures: ${outcome.retryableFailed.join(', ')}`);
      }
      setNotice(parts.join(', ') + '.');
      const failedIds = new Set([
        ...outcome.legalHoldFailed,
        ...outcome.conflictFailed,
        ...outcome.notFound,
        ...outcome.requestFailed,
      ]);
      setSelectedIds(failedIds);
      setRetryableBulkIds(outcome.retryableFailed);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.userMessage : err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setUpdatingIds(new Set());
    }
  }

  function handleSaved(_asset: Asset) {
    setNotice('Saved.');
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          className="search"
          type="search"
          placeholder="Search assets by name or tag"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <details className="filter-menu" ref={sortMenuRef}>
          <summary>{selectedSortLabel}</summary>
          <div className="filter-menu__options">
            {SORTS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="sort"
                  value={option.value}
                  checked={sort === option.value}
                  onChange={() => {
                    setSort(option.value);
                    sortMenuRef.current?.removeAttribute('open');
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
        </details>
      </header>

      <div className="filters">
        {STATUSES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={status.includes(s)}
              onChange={(e) =>
                setStatus((prev) =>
                  e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                )
              }
            />
            {statusLabel(s)}
          </label>
        ))}
        <details className="filter-menu" ref={typeMenuRef}>
          <summary>
            Type{kind.length > 0 ? ` (${kind.length})` : ''}
          </summary>
          <div className="filter-menu__options">
            {KINDS.map((value) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={kind.includes(value)}
                  onChange={(e) =>
                    setKind((prev) =>
                      e.target.checked ? [...prev, value] : prev.filter((item) => item !== value),
                    )
                  }
                />
                {KIND_LABELS[value]}
              </label>
            ))}
          </div>
        </details>
        <span className="muted">
          {loading
            ? 'Loading assets…'
            : `${items.length} of ${total.toLocaleString()} shown${isFetching ? ' — updating…' : ''}`}
        </span>
        {isFetching && !loading && <LoadingSpinner size={16} label="Updating assets" inline />}
        {items.length > 0 && (
          <button type="button" onClick={selectAllLoaded}>
            Select all loaded ({items.length})
          </button>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {notice || resultAnnouncement}
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} disabled={bulkStatusMutation.isPending} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          {retryableBulkIds.length > 0 && lastBulkStatus && (
            <button
              type="button"
              disabled={bulkStatusMutation.isPending}
              onClick={() => applyBulkStatus(lastBulkStatus, retryableBulkIds)}
            >
              Retry failed ({retryableBulkIds.length})
            </button>
          )}
          <button onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
      )}

      {!online && (
        <p className="offline-banner" role="status">
          You're offline. Changes will resume automatically once you're back online.
        </p>
      )}

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && items.length > 0 && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="content">
        <AssetGrid
          assets={items}
          selectedIds={selectedIds}
          updatingIds={updatingIds}
          activeId={activeId}
          onToggleSelect={toggleSelect}
          onOpen={openDetail}
          loading={loading}
          error={error}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
        {activeId && <AssetDetail id={activeId} onClose={closeDetail} onSaved={handleSaved} />}
      </main>
    </div>
  );
}