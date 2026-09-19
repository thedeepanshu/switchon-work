import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { useAssets } from '@/features/assets/useAssets';
import { useBulkStatusMutation } from '@/features/assets/useBulkStatusMutation';
import { statusLabel } from '@/lib/format';
import { readFilterStateFromUrl, writeFilterStateToUrl } from '@/lib/urlState';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import type { Asset, AssetStatus, AssetQuery } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
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
  const [sort, setSort] = useState<NonNullable<AssetQuery['sort']>>(
    () => readFilterStateFromUrl(window.location.search).sort,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    writeFilterStateToUrl({ q, status, sort });
  }, [q, status, sort]);

  useEffect(() => {
    function onPopState() {
      const next = readFilterStateFromUrl(window.location.search);
      setQ(next.q);
      setStatus(next.status);
      setSort(next.sort);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const { items, total, loading, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage, error } =
    useAssets({ q, status, sort });

  const bulkStatusMutation = useBulkStatusMutation();
  const online = useOnlineStatus();

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lastClickedIdRef = useRef<string | null>(null);

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

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setNotice(null);
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
      setNotice(parts.join(', ') + '.');
      const failedIds = new Set([
        ...outcome.legalHoldFailed,
        ...outcome.conflictFailed,
        ...outcome.notFound,
      ]);
      setSelectedIds(failedIds);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.userMessage : err instanceof Error ? err.message : 'Bulk update failed');
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
          placeholder="Search assets"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
        <span className="muted">
          {loading
            ? 'Loading…'
            : `${items.length} of ${total.toLocaleString()} shown${isFetching ? ' — updating…' : ''}`}
        </span>
        {items.length > 0 && (
          <button type="button" onClick={selectAllLoaded}>
            Select all loaded ({items.length})
          </button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} disabled={bulkStatusMutation.isPending} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
      )}

      {!online && (
        <p className="offline-banner" role="status">
          You're offline. Changes will resume automatically once you're back online.
        </p>
      )}

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      <main className="content">
        <AssetGrid
          assets={items}
          selectedIds={selectedIds}
          activeId={activeId}
          onToggleSelect={toggleSelect}
          onOpen={setActiveId}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
        {activeId && (
          <AssetDetail id={activeId} onClose={() => setActiveId(null)} onSaved={handleSaved} />
        )}
      </main>
    </div>
  );
}
