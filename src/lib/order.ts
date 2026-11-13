export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function insertAt(value: string, pos: number, text: string): string {
  const at = Math.min(Math.max(pos, 0), value.length);
  return value.slice(0, at) + text + value.slice(at);
}
