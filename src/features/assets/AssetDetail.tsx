import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAsset, ApiError } from '@/api/client';
import { formatBytes, formatDate, formatDuration, statusLabel } from '@/lib/format';
import { AssetThumbnail } from './AssetThumbnail';
import { useUpdateAssetMutation } from './useUpdateAssetMutation';
import type { Asset, AssetStatus } from '@/lib/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];

interface Props {
  id: string;
  updating: boolean;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

export function AssetDetail({ id, updating, onClose, onSaved }: Props) {
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const updateAssetMutation = useUpdateAssetMutation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { data: asset, isPending, error, refetch } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => getAsset(id),
  });

  useEffect(() => {
    setSaveNotice(null);
  }, [id]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [id]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function setStatus(status: AssetStatus) {
    if (!asset || updating) return;
    setSaveNotice(null);
    try {
      const updated = await updateAssetMutation.mutateAsync({
        id: asset.id,
        version: asset.version,
        patch: { status },
      });
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'version_conflict') {
        setSaveNotice(
          'This asset changed elsewhere. Reloaded the latest version -- please reapply your change if it still applies.',
        );
        try {
          await refetch();
        } catch {
          // If even the refetch fails, the user still sees the notice above.
        }
      } else {
        setSaveNotice(err instanceof ApiError ? err.userMessage : err instanceof Error ? err.message : 'Save failed');
      }
    }
  }

  const saving = updateAssetMutation.isPending || updating;

  return (
    <aside className="panel" aria-label="Asset detail">
      <div className="panel__head">
        <h2>Asset detail</h2>
        <button ref={closeButtonRef} onClick={onClose}>
          Close
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error instanceof ApiError ? error.userMessage : error instanceof Error ? error.message : 'Load failed'}
        </p>
      )}
      {saveNotice && (
        <p className="notice" role="status">
          {saveNotice}
        </p>
      )}
      {!asset && isPending && (
        <div className="panel__loading" role="status">
          <LoadingSpinner size="md" label="Loading asset details" inline />
          <span className="muted">Loading asset…</span>
        </div>
      )}

      {asset && (
        <div className="panel__body">
          <AssetThumbnail asset={asset} className="panel__thumb" />
          <h3>{asset.name}</h3>
          <dl className="facts">
            <dt>Id</dt>
            <dd>{asset.id}</dd>
            <dt>Kind</dt>
            <dd>{asset.kind}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
            {asset.width && (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {asset.width}×{asset.height}
                </dd>
              </>
            )}
            {asset.durationSec && (
              <>
                <dt>Duration</dt>
                <dd>{formatDuration(asset.durationSec)}</dd>
              </>
            )}
            <dt>Owner</dt>
            <dd>{asset.owner.name}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(asset.updatedAt)}</dd>
            <dt>Version</dt>
            <dd>{asset.version}</dd>
          </dl>

          {asset.tags.length > 0 && (
            <ul className="tags">
              {asset.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

          <p className="muted">Status</p>
          <div className="row">
            {STATUSES.map((status) => (
              <button
                key={status}
                disabled={saving || status === asset.status}
                onClick={() => setStatus(status)}
              >
                {saving ? (
                  <LoadingSpinner size={14} label={`Saving ${statusLabel(status)} status`} inline />
                ) : (
                  statusLabel(status)
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}