'use client';

import Image from 'next/image';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';

interface BrandLogoProps {
  className?: string;
  imageClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  showTagline?: boolean;
  size?: number;
}

export default function BrandLogo({
  className = 'flex items-center gap-3',
  imageClassName = 'h-10 w-10',
  wordmarkClassName = 'text-lg font-bold leading-tight',
  showWordmark = false,
  showTagline = false,
  size = 40,
}: BrandLogoProps) {
  return (
    <div className={className}>
      <Image
        src="/branding/controlweave-emblem.svg"
        alt={APP_NAME}
        width={size}
        height={size}
        className={imageClassName}
        priority
      />
      {showWordmark && (
        <span className={wordmarkClassName}>{APP_NAME}</span>
      )}
      {showTagline && (
        <p className="text-sm text-gray-500">{APP_TAGLINE}</p>
      )}
    </div>
  );
}
