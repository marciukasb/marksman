import { describe, it, expect } from 'vitest';
import type { FieldConfig } from '../types';
import { fitWithin, photoFilename, randomSuffix, photoUrlToPath, referencedPhotos, galleryOutsideBody } from './photos';

const fields: FieldConfig[] = [
  { name: 'thumbnail', type: 'image' },
  { name: 'photos', type: 'gallery' },
  { name: 'body', type: 'markdown' },
];

describe('fitWithin', () => {
  it('shrinks a landscape photo to 2000px wide', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
  });

  it('shrinks a portrait photo to 2000px tall', () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000 });
  });

  it('never upscales', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('rounds to whole pixels', () => {
    expect(fitWithin(4032, 3025)).toEqual({ width: 2000, height: 1501 });
  });
});

describe('photo names', () => {
  it('builds slug-number-random.jpg', () => {
    expect(photoFilename('medus', 2, 'k3x9')).toBe('medus-2-k3x9.jpg');
  });

  it('makes a 4 character lowercase suffix', () => {
    expect(randomSuffix()).toMatch(/^[a-z0-9]{4}$/);
  });
});

describe('photoUrlToPath', () => {
  it('maps a prefixed URL into the image folder', () => {
    expect(photoUrlToPath('/images/a.jpg', 'public/images', '/images')).toBe('public/images/a.jpg');
  });

  it('maps an unprefixed URL to the repo path', () => {
    expect(photoUrlToPath('/public/images/a.jpg', 'public/images')).toBe('public/images/a.jpg');
  });
});

describe('referencedPhotos', () => {
  it('collects image, gallery and inline photos once, in order, skipping external URLs', () => {
    const data = { thumbnail: '/images/t.jpg', photos: ['/images/a.jpg', '/images/b.jpg'] };
    const body = 'x ![](/images/b.jpg) ![](https://e.com/x.png)';
    expect(referencedPhotos(data, body, fields)).toEqual(['/images/t.jpg', '/images/a.jpg', '/images/b.jpg']);
  });

  it('ignores empty image fields', () => {
    expect(referencedPhotos({ thumbnail: '' }, '', fields)).toEqual([]);
  });
});

describe('galleryOutsideBody', () => {
  it('drops photos already placed in the text', () => {
    expect(galleryOutsideBody(['/images/a.jpg', '/images/b.jpg'], '![x](/images/b.jpg)')).toEqual(['/images/a.jpg']);
  });
});
