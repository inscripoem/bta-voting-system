import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getBangumiImage = (
  images: any,
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
    if (images[key]) return images[key];
  }

  return null;
};