export type PageStatus = 'draft' | 'published';

export type MatchMode = 'exact' | 'contains';

export interface RevealBlock {
  id: string;
  label: string;
  prompt: string;
  answerAliases: string[];
  secretHtml: string;
  failureMessage: string;
}

export interface UnlockPage {
  id: string;
  label: string;
  path: string;
  prompt: string;
  answerAliases: string[];
  payloadHtml: string;
  failureMessage: string;
}

export interface StudioPage {
  id: string;
  title: string;
  slug: string;
  path: string;
  status: PageStatus;
  pageNumber: number;
  bodyHtml: string;
  themeId?: string;
  allowScripts: boolean;
  memo: string;
  revealBlocks: RevealBlock[];
  unlockPages: UnlockPage[];
}

export interface StudioAsset {
  id: string;
  name: string;
  safeName: string;
  mime: string;
  dataUrl: string;
  bytes: number;
}

export interface StudioTheme {
  id: string;
  name: string;
  css: string;
}

export interface FlowNode {
  id: string;
  label: string;
  pageId?: string;
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface StudioFlowchart {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface SearchRule {
  id: string;
  label: string;
  terms: string[];
  aliases: string[];
  mode: MatchMode;
  targetPageId: string;
  hint: string;
  failureMessage: string;
}

export interface StudioCondition {
  id: string;
  label: string;
  sourcePageId: string;
  targetPageId: string;
  publicHint: string;
  internalNote: string;
}

export interface ImportedScriptMetadata {
  id: string;
  name: string;
  path: string;
  enabled: false;
  source?: string;
  metadata?: unknown;
}

export interface ProjectSnapshot {
  id: string;
  label: string;
  createdAt: string;
  project: StudioProject;
}

export interface StudioProject {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scriptPreviewEnabled: boolean;
  pages: StudioPage[];
  assets: StudioAsset[];
  themes: StudioTheme[];
  flowcharts: StudioFlowchart[];
  searchRules: SearchRule[];
  conditions: StudioCondition[];
  importedScripts: ImportedScriptMetadata[];
  snapshots: ProjectSnapshot[];
}

export interface PublicEncryptedBlob {
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface PublicRevealEntry extends PublicEncryptedBlob {
  id: string;
  prompt: string;
  failureMessage: string;
}

export interface PublicUnlockEntry extends PublicEncryptedBlob {
  id: string;
  path: string;
  prompt: string;
  failureMessage: string;
}

export interface PublicSearchEntry extends PublicEncryptedBlob {
  id: string;
  mode: MatchMode;
  hint: string;
  failureMessage: string;
}

export interface PublicRuntimePayload {
  schemaVersion: 1;
  generatedAt: string;
  genericFailure: string;
  pages: Array<{ title: string; path: string; pageNumber: number }>;
  reveal: PublicRevealEntry[];
  unlock: PublicUnlockEntry[];
  search: PublicSearchEntry[];
}
