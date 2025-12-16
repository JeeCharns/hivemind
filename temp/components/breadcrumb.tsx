import React from "react";

type BreadcrumbProps = {
  segments: Array<React.ReactNode | null | undefined>;
};

export default function Breadcrumb({ segments }: BreadcrumbProps) {
  const items = segments.filter(Boolean) as React.ReactNode[];
  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {items.map((node, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="text-slate-300">/</span>}
          {node}
        </React.Fragment>
      ))}
    </div>
  );
}
