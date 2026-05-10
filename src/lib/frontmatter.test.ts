import { describe, it, expect } from 'vitest';
import { parsePost, serializePost, generateSlug } from './frontmatter';

describe('generateSlug', () => {
  it('lowercases and hyphenates a title', () => {
    expect(generateSlug('My First Post')).toBe('my-first-post');
  });

  it('strips non-alphanumeric characters', () => {
    expect(generateSlug('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(generateSlug('one  two---three')).toBe('one-two-three');
  });
});

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
});
