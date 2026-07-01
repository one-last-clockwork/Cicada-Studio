import type { StudioProject } from '../../types/project';

export type SourceZipIssueKind = 'error' | 'warning' | 'repair';

export interface SourceZipIssue {
  kind: SourceZipIssueKind;
  path?: string;
  message: string;
}

export interface SourceZipDryRunResult {
  ok: boolean;
  project?: StudioProject;
  errors: SourceZipIssue[];
  warnings: SourceZipIssue[];
  repairs: SourceZipIssue[];
}

export interface SourceZipManifest {
  kind: 'cicada-studio-project-source';
  version: 1 | 2;
  exportedAt: string;
  project: {
    schemaVersion: 1 | 2;
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    scriptPreviewEnabled: boolean;
    storyNamespace?: string;
    primarySiteId?: string;
  };
  site?: {
    id: string;
    slug: string;
    name: string;
  };
  sites?: SourceZipSite[];
}

export interface SourceZipSite {
  id: string;
  slug: string;
  name: string;
  pathPrefix?: string;
  root?: string;
  pageFiles: string[];
  themeFiles: string[];
}

export interface SourceZipPageMetadata {
  id?: string;
  title?: string;
  slug?: string;
  path?: string;
  status?: 'draft' | 'published';
  pageNumber?: number;
  themeId?: string;
  allowScripts?: boolean;
  memo?: string;
  bodyFile?: string;
  revealBlocks?: unknown[];
  unlockPages?: unknown[];
}

export interface SourceZipThemeMetadata {
  id?: string;
  name?: string;
  cssFile?: string;
}

export interface SourceZipAssetMetadata {
  id?: string;
  name?: string;
  safeName?: string;
  mime?: string;
  bytes?: number;
  file?: string;
}

export interface SourceZipScriptMetadata {
  id?: string;
  name?: string;
  path?: string;
  enabled?: boolean;
  sourceFile?: string;
  metadata?: unknown;
}
