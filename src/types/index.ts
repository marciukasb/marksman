export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'image' | 'markdown';

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
  data: Record<string, string>;
  body: string;
  sha: string;
}
