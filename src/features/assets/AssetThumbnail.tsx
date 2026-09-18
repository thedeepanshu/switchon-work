import { useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import type { Asset } from '@/lib/types';

interface Props {
  asset: Asset;
  className: string;
}

/**
 * Fixes: rendering a raw <img src={thumbnailUrl(id)}> for every asset means
 * the ~4% with hasThumbnail: false always request a thumbnail that 404s,
 * showing a broken-image icon -- even though the flag telling us not to
 * bother is right there on the asset. Skip the request entirely for those,
 * and fall back to the same placeholder if a request that *should* have
 * worked fails anyway (network chaos isn't only a 4% concern).
 */
export function AssetThumbnail({ asset, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (!asset.hasThumbnail || failed) {
    return (
      <div className={`${className} thumb-placeholder`} aria-hidden="true">
        <span className="thumb-placeholder__label">No preview</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={thumbnailUrl(asset.id)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}