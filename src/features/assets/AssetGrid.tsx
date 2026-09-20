import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Asset } from '@/lib/types';
import { AssetCard } from './AssetCard';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

const MIN_CARD_WIDTH = 220;
const GRID_GAP = 12;
const ROW_HORIZONTAL_PADDING = 16; // matches .grid-row's left+right padding
// Computed, not guessed, now that .card__name is 2-line-clamped and the
// meta line is forced to one line (styles.css) -- every card has exactly
// this body height, so this isn't really an "estimate" anymore:
//   padding-top 8 + name (2 lines @ 14px*1.3 line-height) 36.4
//   + name margin 2 + meta line (13px*1.3) 16.9 + pill margin-top 6
//   + pill box (12px*1.3 + 2px vertical padding) 17.6 + padding-bottom 10
//   = ~97, rounded up for sub-pixel/font-rendering safety margin
const ESTIMATED_BODY_HEIGHT = 100;
const TOP_INSET = 16;
const BOTTOM_INSET = 16;
const LOAD_MORE_THRESHOLD_ROWS = 3;

// Same formula the browser itself uses for
// `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` -- worked
// out in JS instead of left to CSS because the virtualizer needs to know
// the column count up front to slice `assets` into rows; there's no way
// to read "how many columns did auto-fill pick" back out of CSS. Checked
// against the grid's own measured width (a container query, effectively),
// not the viewport, so it responds correctly to the detail panel opening
// and closing, not just window resizes.
function computeColumns(containerWidth: number): number {
  if (containerWidth <= 0) return 1;
  const usable = containerWidth - ROW_HORIZONTAL_PADDING * 2;
  const columns = Math.floor((usable + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP));
  return Math.max(1, columns);
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
 * The scroll container (`.grid`, holding `scrollRef`) is ALWAYS the root
 * element this component returns -- the empty state renders as a child
 * INSIDE it, never as a different root. This matters more than it looks:
 * the width-measuring effect below has an empty dependency array, so it
 * only ever runs once, tied to this component's first commit. If the
 * first render (assets.length === 0, before data arrives) returned a
 * *different* root with no ref on it, the effect would fire once against
 * a null ref, bail out, and never run again for this component's whole
 * life -- containerWidth would stay stuck at 0 permanently (a single
 * full-width column), only ever "fixed" by something that forces a fresh
 * mount, like an HMR reload that happens to already have cached data.
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
  const [containerWidth, setContainerWidth] = useState(0);

  // useLayoutEffect (not useEffect): measures synchronously before paint,
  // against a ref that -- because of the always-mounted-root rule above --
  // is guaranteed to already point at the real element on this first run.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(el);
    return () => observer.disconnect();
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

  // Column count changing means "row N" now holds a different set of
  // assets than before, so any previously-measured row heights (from the
  // old column count) are no longer valid -- force a re-measure.
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

  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className="grid" ref={scrollRef} role="list" aria-label="Assets">
      {assets.length === 0 ? (
        <div className="empty">
          <p>Nothing matches these filters.</p>
          <p className="muted">Clear the search box or widen the status filter.</p>
        </div>
      ) : (
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
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    selected={selectedIds.has(asset.id)}
                    active={activeId === asset.id}
                    onToggleSelect={onToggleSelect}
                    onOpen={onOpen}
                  />
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
      )}
    </div>
  );
}