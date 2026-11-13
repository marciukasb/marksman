export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'image' | 'markdown' | 'gallery' | 'number';

export type FieldValue = string | number | string[];

export interface FieldConfig {
  name: string;
  type: FieldType;
  options?: string[];
  label?: string;
}

export interface SingleConfig {
  name: string;
  file: string;
  imageFolder?: string;
  imageUrlPrefix?: string;
  fields: FieldConfig[];
}

export interface CollectionConfig {
  name: string;
  folder: string;
  imageFolder: string;
  imageUrlPrefix?: string;
  fields: FieldConfig[];
}

export interface CmsConfig {
  deployWorkflow?: string;
  collections: CollectionConfig[];
  singles?: SingleConfig[];
}

export interface Project {
  id: string;
  label: string;
  owner: string;
  repo: string;
  pat: string;
}

export interface PostFile {
  name: string;
  path: string;
  sha: string;
}

export interface ParsedPost {
  data: Record<string, FieldValue>;
  body: string;
  sha: string;
}

export type EntryState = 'draft' | 'submitted' | 'deleted';

export interface LocalEntry {
  key: string;
  projectId: string;
  kind: 'post' | 'single';
  scope: string;
  path: string;
  slug: string | null;
  state: EntryState;
  baseSha: string | null;
  livePhotos: string[];
  data: Record<string, FieldValue>;
  body: string;
  updatedAt: number;
}

export interface LocalPhoto {
  key: string;
  projectId: string;
  url: string;
  path: string;
  blob: Blob;
}

export interface RepoInfo {
  defaultBranch: string;
}
