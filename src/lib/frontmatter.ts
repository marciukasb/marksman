export function parsePost(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const [, yaml, body] = match;
  const data: Record<string, string> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    data[key] = value;
  }
  return { data, body: body.replace(/^\n/, '') };
}

export function serializePost(data: Record<string, string>, body: string): string {
  const yaml = Object.entries(data)
    .map(([key, value]) => {
      const str = String(value ?? '');
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
