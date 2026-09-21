import type { CSSProperties } from 'react';

type SpinnerSize = 'sm' | 'md' | 'lg' | number | string;

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  label?: string;
  inline?: boolean;
}

export function LoadingSpinner({
  size = 'md',
  label = 'Loading',
  inline = false,
}: LoadingSpinnerProps) {
  const isPreset = size === 'sm' || size === 'md' || size === 'lg';
  const style: CSSProperties = isPreset
    ? {}
    : {
        width: typeof size === 'number' ? `${size}px` : size,
        height: typeof size === 'number' ? `${size}px` : size,
      };

  return (
    <div
      className={[
        'loading-spinner',
        isPreset ? `loading-spinner--${size}` : '',
        inline ? 'loading-spinner--inline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-label={label}
      style={style}
    >
      <span className="loading-spinner__ring" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}