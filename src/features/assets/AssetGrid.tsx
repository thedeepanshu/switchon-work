import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatBytes, formatDate } from '@/lib/format';
import { AssetThumbnail } from './AssetThumbnail';
import { statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

const GRID_GAP = 12;
const ROW_HORIZONTAL_PADDING = 16; // matches .grid-row's left+right padding
const ESTIMATED_BODY_HEIGHT = 84; // name + meta + pill; corrected post-render by measureElement
const TOP_INSET = 16;
const BOTTOM_INSET = 16;
const LOAD_MORE_THRESHOLD_ROWS = 3;

// Explicit device-class breakpoints rather than a continuous "however many
// 220px cards fit" auto-fit -- that approach gives an unpredictable column
// count (and looks like "everything is full width" the moment the
// container is narrower than 2x the min card width, which is exactly what
// a split-pane layout with the detail panel open produces). Checked
// against the grid's own measured width (a container query, effectively),
// not the viewport -- so columns respond correctly to the detail panel
// opening/closing, not just window resizes. Ordered widest-first; the
// first breakpoint the available width satisfies wins. Thresholds are
// chosen so the resulting card width never drops much below ~200px:
//   6 cols @ 1280px usable -> ~203px cards
//   4 cols @  900px usable -> ~216px cards
//   3 cols @  700px usable -> ~225px cards
//   2 cols @  480px usable -> ~234px cards
//   1 col  below that
const COLUMN_BREAKPOINTS: Array<{ minWidth: number; columns: number }> = [
  { minWidth: 1280, columns: 6 }, // desktop
  { minWidth: 900, columns: 4 }, // laptop
  { minWidth: 700, columns: 3 }, // tablet, landscape
  { minWidth: 480, columns: 2 }, // tablet, portrait / large phone
  { minWidth: 0, columns: 1 }, // mobile
];

function computeColumns(containerWidth: number): number {
  if (containerWidth <= 0) return 1;
  const usable = containerWidth - ROW_HORIZONTAL_PADDING * 2;
  const match = COLUMN_BREAKPOINTS.find((bp) => usable >= bp.minWidth);
  return match?.columns ?? 1;
}

function estimateRowHeight(containerWidth: number, columns: number): number {
  const usable = containerWidth - ROW_HORIZONTAL_PADDING * 2;
  const cardWidth = (usable - GRID_GAP * (columns - 1)) / columns;
  const thumbHeight = cardWidth * (10 / 16); // matches .card__thumb's aspect-ratio
  return thumbHeight + ESTIMATED_BODY_HEIGHT + GRID_GAP;
}

/**
 * Virtualized, cursor-paginated grid.
 *
 * Renders only the rows near the viewport (via @tanstack/react-virtual)
 * instead of every asset at once, so DOM node count and memory stay flat
 * as more pages load in. Row height is estimated from the measured
 * container width (thumbnails are a fixed aspect ratio, so width
 * determines height) and then self-corrected per row via measureElement,
 * since asset names can wrap to a second line.
 *
 * Selection and the active/open id are NOT part of what determines which
 * rows exist or their order, so toggling a selection or opening the detail
 * panel doesn't reset scroll position -- the scroll container itself never
 * remounts.
 */
export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onOpen,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth);

  // useLayoutEffect, not useEffect: measures synchronously before the
  // browser paints. The animation-frame read also covers flex layout settling
  // after a hard refresh, when clientWidth can briefly still be zero.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(el);
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const columns = computeColumns(containerWidth);
  const rowCount = Math.ceil(assets.length / columns);
  const estimatedRowHeight = estimateRowHeight(containerWidth, columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 4,
  });

  useEffect(() => {
    if (containerWidth > 0) rowVirtualizer.measure();
  }, [containerWidth, columns, rowVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRowIndex = virtualRows[virtualRows.length - 1]?.index;

  // Fetch the next page a few rows before the user actually hits the
  // bottom, so scrolling doesn't visibly pause waiting on the network.
  useEffect(() => {
    if (lastVirtualRowIndex === undefined) return;
    if (lastVirtualRowIndex >= rowCount - LOAD_MORE_THRESHOLD_ROWS && hasNextPage && !isFetchingNextPage) {
      onLoadMore();
    }
  }, [lastVirtualRowIndex, rowCount, hasNextPage, isFetchingNextPage, onLoadMore]);

  if (assets.length === 0) {
    return (
      <div className="empty">
        <p>Nothing matches these filters.</p>
        <p className="muted">Clear the search box or widen the status filter.</p>
      </div>
    );
  }

  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className="grid" ref={scrollRef} role="list" aria-label="Assets">
      <div className="grid-sizer" style={{ height: totalSize + TOP_INSET + BOTTOM_INSET }}>
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowAssets = assets.slice(startIndex, startIndex + columns);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="grid-row"
              style={{
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                transform: `translateY(${virtualRow.start + TOP_INSET}px)`,
              }}
            >
              {rowAssets.map((asset) => (
                <div
                  key={asset.id}
                  role="listitem"
                  className={
                    'card' +
                    (selectedIds.has(asset.id) ? ' card--selected' : '') +
                    (activeId === asset.id ? ' card--active' : '')
                  }
                  onClick={() => onOpen(asset.id)}
                >
                  <AssetThumbnail asset={asset} className="card__thumb" />
                  <div className="card__body">
                    <p className="card__name">{asset.name}</p>
                    <p className="muted">
                      {asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}
                    </p>
                    <span className={`pill pill--${asset.status}`}>{statusLabel(asset.status)}</span>
                  </div>
                  <input
                    type="checkbox"
                    className="card__check"
                    checked={selectedIds.has(asset.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleSelect(asset.id)}
                  />
                </div>
              ))}
            </div>
          );
        })}
        {isFetchingNextPage && (
          <div
            className="grid-loading-more muted"
            role="status"
            style={{ transform: `translateY(${totalSize + TOP_INSET}px)` }}
          >
            Loading more…
          </div>
        )}
      </div>
    </div>
  );
}