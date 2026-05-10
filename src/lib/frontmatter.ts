import matter from 'gray-matter';

export function parsePost(raw: string): { data: Record<string, string>; body: string } {
  const { data, content } = matter(raw);
  return { data: data as Record<string, string>, body: content };
}

export function serializePost(data: Record<string, string>, body: string): string {
  const yaml = Object.entries(data)
    .map(([key, value]) => {
      const str = String(value ?? '');
      // Quote strings that contain special YAML characters or colons
      const needsQuotes = /[:#\[\]{}&*!|>'"%@`]/.test(str) || str.includes('\n') || str.trimStart() !== str;
      return needsQuotes ? `${key}: "${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : `${key}: ${str}`;
    })
    .join('\n');
  return `---\n${yaml}\n---\n\n${body}`;
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
