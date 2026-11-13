import type { FieldValue } from '../types';

const NUMBER = /^-?\d+(\.\d+)?$/;
// Plain scalars YAML would read as something other than a string
const RESERVED = /^(true|false|yes|no|on|off|null|~)$/i;

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

// Leading zeros (007) would be lost as a number, so those stay text
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

function parseScalar(value: string): string | number {
  if (PLAIN_NUMBER.test(value)) return Number(value);
  return unquote(value);
}

export function parsePost(raw: string): { data: Record<string, FieldValue>; body: string } {
  // The closing --- must sit on its own line; empty front matter (---\n---) has no YAML group
  const match = raw.match(/^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const [, yaml = '', body] = match;
  const data: Record<string, FieldValue> = {};
  let listKey: string | null = null;
  // Keys written as `key:` with nothing after; they become lists only if items follow
  const bareKeys = new Set<string>();
  for (const line of yaml.split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1].trim()));
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    listKey = null;
    if (value === '') {
      data[key] = [];
      listKey = key;
      bareKeys.add(key);
    } else if (value === '[]') {
      data[key] = [];
    } else {
      data[key] = parseScalar(value);
    }
  }
  for (const key of bareKeys) {
    if ((data[key] as string[]).length === 0) data[key] = '';
  }
  return { data, body: body.replace(/^\n/, '') };
}

function serializeString(str: string): string {
  const needsQuotes =
    str === '' ||
    NUMBER.test(str) ||
    RESERVED.test(str) ||
    /^\d{4}-\d{2}-\d{2}/.test(str) ||
    /[:#[\]{}&*!|>'"%@`]/.test(str) ||
    str.includes('\n') ||
    str.trim() !== str;
  return needsQuotes ? `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : str;
}

export function serializePost(data: Record<string, FieldValue>, body: string): string {
  const yaml = Object.entries(data)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 0) return `${key}: []`;
        return `${key}:\n${value.map(v => `  - ${serializeString(v)}`).join('\n')}`;
      }
      if (typeof value === 'number') return `${key}: ${value}`;
      return `${key}: ${serializeString(String(value ?? ''))}`;
    })
    .join('\n');
  return `---\n${yaml}\n---\n\n${body}`;
}

