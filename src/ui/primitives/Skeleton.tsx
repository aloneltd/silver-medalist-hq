export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
  /** For a row skeleton that should hold the identity of the row it will become. */
  'aria-label'?: string;
}

/** Shimmer placeholder. Used INSIDE the rows/cards that will hold real results (never a
 * full-screen spinner) so identity and layout stay stable across a fetch. */
export function Skeleton({ width = '100%', height = 14, radius = 6, className = '', ...rest }: SkeletonProps) {
  return (
    <span
      className={`smhq-skeleton ${className}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
    />
  );
}
