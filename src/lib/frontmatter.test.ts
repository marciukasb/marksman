import { describe, it, expect } from 'vitest';
import { parsePost, serializePost } from './frontmatter';

describe('parsePost', () => {
  it('parses frontmatter and body from raw markdown', () => {
    const raw = `---\ntitle: "Hello"\ndate: "2026-01-01"\n---\n\nBody here.`;
    const { data, body } = parsePost(raw);
    expect(data.title).toBe('Hello');
    expect(data.date).toBe('2026-01-01');
    expect(body.trim()).toBe('Body here.');
  });
});

describe('serializePost', () => {
  it('round-trips data and body through serialize then parse', () => {
    const data = { title: 'Test', date: '2026-05-10' };
    const body = 'Post content here.';
    const raw = serializePost(data, body);
    const parsed = parsePost(raw);
    expect(parsed.data.title).toBe('Test');
    expect(parsed.body.trim()).toBe('Post content here.');
  });

  it('handles fields with colons (thumbnail paths, summaries)', () => {
    const data = {
      title: 'My Post',
      summary: 'A quick summary: it works',
      thumbnail: '/public/images/hero.png',
      date: '2026-05-10',
    };
    const body = '## Hello\n\nBody with **markdown**.';
    const raw = serializePost(data, body);
    const parsed = parsePost(raw);
    expect(parsed.data.title).toBe('My Post');
    expect(parsed.data.summary).toBe('A quick summary: it works');
    expect(parsed.data.thumbnail).toBe('/public/images/hero.png');
    expect(parsed.data.date).toBe('2026-05-10');
    expect(parsed.body.trim()).toBe(body);
  });

  it('handles empty fields', () => {
    const data = { title: 'No Thumbnail', thumbnail: '', date: '2026-05-10' };
    const raw = serializePost(data, '');
    const parsed = parsePost(raw);
    expect(parsed.data.title).toBe('No Thumbnail');
    expect(parsed.data.thumbnail).toBe('');
  });
});

describe('lists', () => {
  it('parses a list of strings', () => {
    const raw = '---\nphotos:\n  - /images/a.jpg\n  - "/images/b c.jpg"\n---\n\nT';
    expect(parsePost(raw).data.photos).toEqual(['/images/a.jpg', '/images/b c.jpg']);
  });

  it('serializes a list as YAML items', () => {
    expect(serializePost({ photos: ['/images/a.jpg'] }, 'T')).toContain('photos:\n  - /images/a.jpg');
  });

  it('serializes and parses an empty list', () => {
    const raw = serializePost({ photos: [] }, 'T');
    expect(raw).toContain('photos: []');
    expect(parsePost(raw).data.photos).toEqual([]);
  });
});

describe('numbers', () => {
  it('parses an unquoted number as a number', () => {
    expect(parsePost('---\naviliai: 24\n---\n').data.aviliai).toBe(24);
  });

  it('serializes a number without quotes', () => {
    expect(serializePost({ aviliai: 24 }, '')).toContain('aviliai: 24');
  });

  it('keeps a number with leading zeros as written', () => {
    expect(parsePost('---\ncode: 007\n---\n').data.code).toBe('007');
  });

  it('keeps a quoted number as a string', () => {
    expect(parsePost('---\ntitle: "2025"\n---\n').data.title).toBe('2025');
  });
});

describe('quoting strings YAML would misread', () => {
  it.each(['2025', 'true', 'null', 'No', '~'])('quotes %s', value => {
    expect(serializePost({ title: value }, '')).toContain(`title: "${value}"`);
  });
});

describe('Ember round-trip', () => {
  it('keeps every value unchanged', () => {
    const ember = '---\ntitle: "Hello"\nsummary: Plain text\ntopic: Tech\ndate: "2026-01-15"\nthumbnail: /images/x.png\n---\n\nBody';
    const first = parsePost(ember);
    expect(parsePost(serializePost(first.data, first.body))).toEqual(first);
  });
});

describe('dashes inside values', () => {
  it('keeps --- inside a title as part of the title', () => {
    const raw = serializePost({ title: 'Before --- after' }, 'Body');
    expect(parsePost(raw)).toEqual({ data: { title: 'Before --- after' }, body: 'Body' });
  });

  it('parses empty front matter', () => {
    expect(parsePost('---\n---\n\nBody')).toEqual({ data: {}, body: 'Body' });
  });
});
