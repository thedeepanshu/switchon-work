import { memo } from 'react';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import { AssetThumbnail } from './AssetThumbnail';
import type { Asset } from '@/lib/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface Props {
  asset: Asset;
  selected: boolean;
  updating: boolean;
  active: boolean;
  tabIndex: number;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  onFocus: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onCardRef: (el: HTMLDivElement | null, id: string) => void;
}

function AssetCardImpl({
  asset,
  selected,
  updating,
  active,
  tabIndex,
  onToggleSelect,
  onOpen,
  onFocus,
  onKeyDown,
  onCardRef,
}: Props) {
  const isUpdateable = !asset.tags.includes('legal-hold');

  return (
    <div
      ref={(el) => onCardRef(el, asset.id)}
      role="option"
      aria-label={`${asset.name} ${selected ? 'selected' : 'not selected'} ${updating ? 'updating' : ''}`.trim()}
      aria-selected={selected}
      tabIndex={tabIndex}
      className={
        'card' +
        (selected ? ' card--selected' : '') +
        (selected && !isUpdateable ? ' card--unupdateable' : '') +
        (active ? ' card--active' : '')
      }
      onClick={() => onOpen(asset.id)}
      onFocus={() => onFocus(asset.id)}
      onKeyDown={(e) => onKeyDown(e, asset.id)}
    >
      <AssetThumbnail asset={asset} className="card__thumb" />
      <div className="card__body">
        <p className="card__name">{asset.name}</p>
        <p className="muted">
          {asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}
        </p>
        <span
          className={`pill ${updating ? 'pill--updating' : `pill--${asset.status}`}`}
          aria-label={updating ? 'Updating status' : statusLabel(asset.status)}
        >
          {updating ? <LoadingSpinner size={16} label="Updating status" inline /> : statusLabel(asset.status)}
        </span>
      </div>
      <input
        type="checkbox"
        className="card__check"
        tabIndex={-1}
        checked={selected}
        aria-label={selected ? `Remove ${asset.name} from selection` : `Select ${asset.name}`}
        aria-checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggleSelect(asset.id, !!(e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey))}
      />
    </div>
  );
}

export const AssetCard = memo(AssetCardImpl);