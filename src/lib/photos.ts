import type { FieldConfig, FieldValue } from '../types';

export const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.82;
const INLINE_IMAGE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function photoFilename(slug: string, n: number, rand: string): string {
  return `${slug}-${n}-${rand}.jpg`;
}

export function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Shrinks and re-encodes a photo in the browser so phone-size images don't bloat the repo
export async function processPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Could not read this photo');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not read this photo'))), 'image/jpeg', JPEG_QUALITY);
  });
}

export function photoUrlToPath(url: string, imageFolder: string, imageUrlPrefix?: string): string {
  if (imageUrlPrefix && url.startsWith(`${imageUrlPrefix}/`)) {
    return `${imageFolder}/${url.slice(imageUrlPrefix.length + 1)}`;
  }
  return url.replace(/^\//, '');
}

function inlinePhotos(body: string): string[] {
  return Array.from(body.matchAll(INLINE_IMAGE), m => m[1]);
}

export function referencedPhotos(data: Record<string, FieldValue>, body: string, fields: FieldConfig[]): string[] {
  const urls: string[] = [];
  for (const field of fields) {
    const value = data[field.name];
    if (field.type === 'image' && typeof value === 'string') urls.push(value);
    if (field.type === 'gallery' && Array.isArray(value)) urls.push(...value);
  }
  urls.push(...inlinePhotos(body));
  return [...new Set(urls.filter(url => url.startsWith('/')))];
}

export function galleryOutsideBody(photos: string[], body: string): string[] {
  const inline = new Set(inlinePhotos(body));
  return photos.filter(url => !inline.has(url));
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
