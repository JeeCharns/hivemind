type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-slate-200 rounded ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

export function AvatarSkeleton({ className = "h-8 w-8" }: SkeletonProps) {
  return <Skeleton className={`${className} rounded-full`} />;
}

export function TextSkeleton({ className = "h-4 w-24" }: SkeletonProps) {
  return <Skeleton className={className} />;
}

