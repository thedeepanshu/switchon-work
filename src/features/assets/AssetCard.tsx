import { memo } from 'react';
import { formatBytes, formatDate } from '@/lib/format';
import { AssetThumbnail } from './AssetThumbnail';
import { statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface Props {
  asset: Asset;
  selected: boolean;
  active: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

function AssetCardImpl({ asset, selected, active, onToggleSelect, onOpen }: Props) {
  return (
    <div
      role="listitem"
      className={'card' + (selected ? ' card--selected' : '') + (active ? ' card--active' : '')}
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
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect(asset.id)}
      />
    </div>
  );
}

/**
 * Memoized so toggling one card's selection (or opening/closing the detail
 * panel) doesn't re-render every other visible card -- only the card whose
 * own `selected`/`active` prop actually changed re-renders.
 *
 * This only works because `onToggleSelect`/`onOpen` are stable function
 * references from the parent (useCallback / a state setter). If either
 * were a new closure every render, the default shallow prop comparison
 * would see a "new" prop every time and this memo would do nothing.
 */
export const AssetCard = memo(AssetCardImpl);