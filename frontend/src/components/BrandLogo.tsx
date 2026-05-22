import Image from 'next/image';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';

interface BrandLogoProps {
  className?: string;
  imageClassName?: string;
  showTagline?: boolean;
  showWordmark?: boolean;
  size?: number;
  wordmarkClassName?: string;
  taglineClassName?: string;
}

export default function BrandLogo({
  className,
  imageClassName,
  showTagline = false,
  showWordmark = true,
  size = 56,
  wordmarkClassName = 'text-lg font-bold text-gray-900 leading-tight',
  taglineClassName = 'text-sm text-gray-600 mt-1',
}: BrandLogoProps) {
  return (
    <div className={className}>
      <Image
        src="/branding/controlweave-emblem.svg"
        alt={`${APP_NAME} logo`}
        width={size}
        height={size}
        priority
        className={imageClassName}
      />
      {showWordmark && (
        <div>
          <p className={wordmarkClassName}>{APP_NAME}</p>
          {showTagline && <p className={taglineClassName}>{APP_TAGLINE}</p>}
        </div>
      )}
    </div>
  );
}