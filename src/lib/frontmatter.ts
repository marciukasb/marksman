import matter from 'gray-matter';

export function parsePost(raw: string): { data: Record<string, string>; body: string } {
  const { data, content } = matter(raw);
  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ''),
    ])
  );
  return { data: stringData, body: content };
}

export function serializePost(data: Record<string, string>, body: string): string {
  const yaml = Object.entries(data)
    .map(([key, value]) => {
      const str = String(value ?? '');
      // Quote strings with special YAML chars, dates (avoid Date object parsing), or empty values
      const needsQuotes =
        str === '' ||
        /^\d{4}-\d{2}-\d{2}/.test(str) ||
        /[:#\[\]{}&*!|>'"%@`]/.test(str) ||
        str.includes('\n') ||
        str.trimStart() !== str;
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
