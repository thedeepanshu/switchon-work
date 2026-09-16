import { useState } from 'react';
import { bulkSetStatus } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { useAssets } from '@/features/assets/useAssets';
import { chunk } from '@/lib/chunk';
import { mapWithConcurrency } from '@/lib/concurrency';
import { statusLabel } from '@/lib/format';
import type { Asset, AssetStatus, AssetQuery } from '@/lib/types';

// bulk-status hard caps ids at 50 per call; keep some headroom below that
// and bound how many chunks run at once so this doesn't itself trip the
// 80-req/10s rate limit when a reviewer selects hundreds of assets.
const BULK_CHUNK_SIZE = 5;
const BULK_CHUNK_CONCURRENCY = 3;

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

export function App() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AssetStatus[]>([]);
  const [sort, setSort] = useState<NonNullable<AssetQuery['sort']>>('updatedAt:desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Every keystroke sends a request. Nothing is debounced or cancelled.
  const { items, total, loading, error } = useAssets({ q, status, sort, limit: 24 });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setNotice(null);
    try {
      // Split into <=50-id chunks (the API's hard cap) and run a handful
      // concurrently rather than one request per chunk in serial.
      //
      // NOTE: this only fixes the "fails outright above 50" defect. It does
      // not yet do optimistic updates, per-id failure reporting, or retrying
      // the ~7% random `conflict` failures separately from the deterministic
      // `legal_hold` ones -- that full treatment lands in Task 3.
      const chunks = chunk(ids, BULK_CHUNK_SIZE);
      const chunkResults = await mapWithConcurrency(chunks, BULK_CHUNK_CONCURRENCY, (idsChunk) =>
        bulkSetStatus(idsChunk, next),
      );
      const applied = chunkResults.reduce((sum, r) => sum + r.applied, 0);
      const failed = chunkResults.reduce((sum, r) => sum + r.failed, 0);
      setNotice(`${applied} updated, ${failed} failed.`);
      setSelectedIds(new Set());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Bulk update failed');
    }
  }

  function handleSaved(_asset: Asset) {
    // The list is not told that anything changed, so it shows stale rows.
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
          {loading ? 'Loading…' : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
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
        />
        {activeId && (
          <AssetDetail id={activeId} onClose={() => setActiveId(null)} onSaved={handleSaved} />
        )}
      </main>
    </div>
  );
}
