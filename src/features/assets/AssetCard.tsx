import { memo } from 'react';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import { AssetThumbnail } from './AssetThumbnail';
import type { Asset } from '@/lib/types';

interface Props {
  asset: Asset;
  selected: boolean;
  active: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
}

function AssetCardImpl({ asset, selected, active, onToggleSelect, onOpen }: Props) {
  const isUpdateable = !asset.tags.includes('legal-hold');

  return (
    <div
      role="listitem"
      className={
        'card' +
        (selected ? ' card--selected' : '') +
        (selected && !isUpdateable ? ' card--unupdateable' : '') +
        (active ? ' card--active' : '')
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
        checked={selected}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(asset.id, e.shiftKey);
        }}
      />
    </div>
  );
}

export const AssetCard = memo(AssetCardImpl);
