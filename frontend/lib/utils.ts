import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type BangumiImages = Partial<Record<'grid' | 'small' | 'medium' | 'common' | 'large', string>>

export const getBangumiImage = (
  images: BangumiImages | null | undefined,
  size: 'grid' | 'small' | 'medium' | 'common' | 'large' = 'common'
): string | null => {
  if (!images) return null;

  const fallbacks = {
    grid:   ['grid', 'small', 'medium', 'common', 'large'],
    small:  ['small', 'grid', 'medium', 'common', 'large'],
    medium: ['medium', 'common', 'large', 'grid', 'small'],
    common: ['common', 'medium', 'large', 'grid', 'small'],
    large:  ['large', 'common', 'medium', 'grid', 'small']
  };

  const priority = fallbacks[size] || fallbacks.common;

  for (const key of priority) {
    const val = images[key as keyof BangumiImages]
    if (val) return val;
  }

  return null;
};