'use client';

import React from 'react';

/**
 * Skeleton loader library — animated placeholder components that match the
 * shape of real content, reducing perceived load time across the dashboard.
 *
 * All skeletons use Tailwind's `animate-pulse` for a low-cost shimmer effect
 * without additional CSS or third-party libraries.
 */

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

// `SkeletonProps` extends `HTMLAttributes<HTMLDivElement>` so callers can
// pass standard div props (e.g. `style`, `role`, data-* attributes) without
// breaking TypeScript type-checking.
interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = '', ...rest }: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 rounded animate-pulse ${className}`}
      aria-hidden="true"
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Card skeleton — matches a typical summary card layout
// ---------------------------------------------------------------------------

export function CardSkeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-8 w-20 mb-2" />
      <Skeleton className="h-3 w-full mb-1" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard grid skeleton — three stat cards side by side
// ---------------------------------------------------------------------------

export function DashboardSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <TableSkeleton rows={5} cols={4} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table skeleton — list of rows with varying widths
// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  showHeader?: boolean;
}

export function TableSkeleton({ rows = 5, cols = 4, showHeader = true }: TableSkeletonProps) {
  return (
    <div className="space-y-2">
      {showHeader && (
        <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3 py-2 border-t border-gray-100"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3"
              style={{ width: `${60 + ((r + c) % 4) * 10}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assessment skeleton — heading + grouped control list
// ---------------------------------------------------------------------------

export function AssessmentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-64 mb-6" />
      {[1, 2].map(g => (
        <div key={g} className="bg-white border border-gray-200 rounded-lg p-4">
          <Skeleton className="h-4 w-32 mb-3" />
          {[1, 2, 3].map(r => (
            <div key={r} className="flex items-center gap-3 py-2 border-t border-gray-50">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence list skeleton
// ---------------------------------------------------------------------------

export function EvidenceListSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-4">
          <Skeleton className="w-10 h-10 rounded" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TPRM vendor list skeleton
// ---------------------------------------------------------------------------

export function VendorListSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page-level skeleton (heading + content area)
// ---------------------------------------------------------------------------

export function PageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Skeleton className="h-8 w-56 mb-2" />
      <Skeleton className="h-4 w-80 mb-8" />
      <DashboardSkeleton />
    </div>
  );
}
