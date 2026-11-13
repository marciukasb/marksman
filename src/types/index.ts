export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'image' | 'markdown';

export type FieldValue = string | number | string[];

export interface FieldConfig {
  name: string;
  type: FieldType;
  options?: string[];
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
