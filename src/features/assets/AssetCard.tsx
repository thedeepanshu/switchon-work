import { memo } from 'react';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import { AssetThumbnail } from './AssetThumbnail';
import type { Asset } from '@/lib/types';

interface Props {
  asset: Asset;
  selected: boolean;
  active: boolean;
  tabIndex: number;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onCardRef: (el: HTMLDivElement | null, id: string) => void;
}

function AssetCardImpl({
  asset,
  selected,
  active,
  tabIndex,
  onToggleSelect,
  onOpen,
  onKeyDown,
  onCardRef,
}: Props) {
  const isUpdateable = !asset.tags.includes('legal-hold');

  return (
    <div
      ref={(el) => onCardRef(el, asset.id)}
      role="option"
      aria-selected={selected}
      tabIndex={tabIndex}
      className={
        'card' +
        (selected ? ' card--selected' : '') +
        (selected && !isUpdateable ? ' card--unupdateable' : '') +
        (active ? ' card--active' : '')
      }
      onClick={() => onOpen(asset.id)}
      onKeyDown={(e) => onKeyDown(e, asset.id)}
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
        tabIndex={-1}
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggleSelect(asset.id, (e.nativeEvent as MouseEvent).shiftKey)}
      />
    </div>
  );
}

export const AssetCard = memo(AssetCardImpl);