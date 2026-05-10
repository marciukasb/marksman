import matter from 'gray-matter';

export function parsePost(raw: string): { data: Record<string, string>; body: string } {
  const { data, content } = matter(raw);
  return { data: data as Record<string, string>, body: content };
}

export function serializePost(data: Record<string, string>, body: string): string {
  return matter.stringify(body, data);
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
