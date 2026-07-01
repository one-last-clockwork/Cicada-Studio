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

export interface StudioSite {
  id: string;
  name: string;
  slug: string;
  pathPrefix: string;
  pages: StudioPage[];
  themes: StudioTheme[];
}

export type StoryMapNodeType =
  | 'project'
  | 'site'
  | 'page'
  | 'clue'
  | 'discovery'
  | 'action'
  | 'gate'
  | 'internal_site'
  | 'external_surface'
  | 'messenger'
  | 'state_change'
  | 'custom';

export type StoryMapLinkedEntityKind =
  | 'project'
  | 'site'
  | 'page'
  | 'reveal'
  | 'unlock'
  | 'search'
  | 'condition'
  | 'messenger_thread'
  | 'messenger_node'
  | 'asset'
  | 'external';

export interface StoryMapLinkedEntity {
  kind: StoryMapLinkedEntityKind;
  id?: string;
  siteId?: string;
  pageId?: string;
  threadId?: string;
  nodeId?: string;
  url?: string;
}

export interface StoryMapNode {
  id: string;
  label: string;
  type: StoryMapNodeType;
  linkedEntity?: StoryMapLinkedEntity;
  siteId?: string;
  pageId?: string;
  externalUrl?: string;
  notes: string;
  tags: string[];
  x: number;
  y: number;
}

export type StoryMapEdgeAction =
  | 'read'
  | 'notice'
  | 'search_web'
  | 'search_social'
  | 'enter_url'
  | 'move_site'
  | 'solve_cipher'
  | 'submit_keyword'
  | 'combine_clues'
  | 'wait'
  | 'receive_message'
  | 'custom';

export type StoryPathRole = 'intended' | 'alternate' | 'shortcut_allowed' | 'recovery' | 'risk';

export type StoryPrerequisiteMode = 'permissive' | 'strict';

export type StoryTriggerType =
  | 'pageVisited'
  | 'revealSolved'
  | 'unlockSolved'
  | 'searchSolved'
  | 'conditionReached'
  | 'messengerThreadOpened'
  | 'messengerNodeDelivered'
  | 'messengerNodeReached'
  | 'messengerChoiceSelected'
  | 'messengerInputMatched'
  | 'manual';

export interface StoryTrigger {
  id: string;
  type: StoryTriggerType;
  siteId?: string;
  pageId?: string;
  revealId?: string;
  unlockId?: string;
  searchRuleId?: string;
  conditionId?: string;
  threadId?: string;
  nodeId?: string;
  choiceId?: string;
  matchId?: string;
  flagId?: string;
}

export type StoryEffectType =
  | 'setFlag'
  | 'unlockPage'
  | 'unlockReveal'
  | 'deliverMessengerNode'
  | 'scheduleMessengerNode'
  | 'setMessengerUnread'
  | 'jumpMessengerNode';

export interface StoryEffect {
  id: string;
  type: StoryEffectType;
  flagId?: string;
  siteId?: string;
  pageId?: string;
  revealId?: string;
  threadId?: string;
  nodeId?: string;
  delayMs?: number;
  count?: number;
}

export interface StoryMapEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  action: StoryMapEdgeAction;
  pathRole: StoryPathRole;
  prerequisiteMode: StoryPrerequisiteMode;
  difficulty?: 'low' | 'medium' | 'high';
  expectedInput?: string;
  fallbackHint?: string;
  notes: string;
  tags: string[];
  trigger?: StoryTrigger;
  effects: StoryEffect[];
}

export interface StudioStoryMap {
  id: string;
  name: string;
  nodes: StoryMapNode[];
  edges: StoryMapEdge[];
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

export interface MessengerParticipant {
  id: string;
  name: string;
  role: 'player' | 'character' | 'system';
  avatarAssetId?: string;
}

export interface MessengerChoice {
  id: string;
  label: string;
  targetNodeId?: string;
  effects: StoryEffect[];
}

export interface MessengerInputMatcher {
  id: string;
  label: string;
  terms: string[];
  mode: MatchMode;
  targetNodeId?: string;
  effects: StoryEffect[];
}

export interface MessengerProtectedMessage {
  prompt: string;
  answerAliases: string[];
  secretBody: string;
  failureMessage: string;
}

export type MessengerNodeKind = 'text' | 'choice' | 'input' | 'delay' | 'system';

export interface MessengerNode {
  id: string;
  senderId: string;
  kind: MessengerNodeKind;
  body: string;
  protectedMessage?: MessengerProtectedMessage;
  choices: MessengerChoice[];
  matchers: MessengerInputMatcher[];
  delayMs?: number;
  effects: StoryEffect[];
}

export interface MessengerThread {
  id: string;
  title: string;
  participants: MessengerParticipant[];
  nodes: MessengerNode[];
}

export interface StoryStateThread {
  currentNodeId?: string;
  unreadCount: number;
  deliveredNodeIds: string[];
  reachedNodeIds: string[];
  displayedProtectedMessages: Record<string, string>;
}

export interface StudioStoryState {
  flags: Record<string, boolean>;
  visitedPages: string[];
  solvedEvents: string[];
  unlockedPages: string[];
  messenger: {
    threads: Record<string, StoryStateThread>;
  };
}

export interface ProjectSnapshot {
  id: string;
  label: string;
  createdAt: string;
  project: StudioProject;
}

export interface StudioProject {
  schemaVersion: 2;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scriptPreviewEnabled: boolean;
  storyNamespace: string;
  primarySiteId: string;
  sites: StudioSite[];
  assets: StudioAsset[];
  storyMaps: StudioStoryMap[];
  searchRules: SearchRule[];
  conditions: StudioCondition[];
  messengerThreads: MessengerThread[];
  storyState: StudioStoryState;
  importedScripts: ImportedScriptMetadata[];
  snapshots: ProjectSnapshot[];
}

export interface LegacyFlowNode {
  id: string;
  label: string;
  pageId?: string;
  x: number;
  y: number;
}

export interface LegacyFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface LegacyStudioFlowchart {
  id: string;
  name: string;
  nodes: LegacyFlowNode[];
  edges: LegacyFlowEdge[];
}

export interface LegacyProjectSnapshot {
  id: string;
  label: string;
  createdAt: string;
  project: LegacyStudioProject;
}

export interface LegacyStudioProject {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scriptPreviewEnabled: boolean;
  pages: StudioPage[];
  assets: StudioAsset[];
  themes: StudioTheme[];
  flowcharts: LegacyStudioFlowchart[];
  searchRules: SearchRule[];
  conditions: StudioCondition[];
  importedScripts: ImportedScriptMetadata[];
  snapshots: LegacyProjectSnapshot[];
}

export type AnyStudioProject = StudioProject | LegacyStudioProject;

export type FlowNode = LegacyFlowNode;
export type FlowEdge = LegacyFlowEdge;
export type StudioFlowchart = LegacyStudioFlowchart;

export interface PublicEncryptedBlob {
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface PublicRevealEntry extends PublicEncryptedBlob {
  id: string;
  prompt: string;
  failureMessage: string;
  eventId?: string;
}

export interface PublicUnlockEntry extends PublicEncryptedBlob {
  id: string;
  path: string;
  prompt: string;
  failureMessage: string;
  eventId?: string;
}

export interface PublicSearchEntry extends PublicEncryptedBlob {
  id: string;
  mode: MatchMode;
  hint: string;
  failureMessage: string;
  eventId?: string;
}

export interface PublicPageEntry {
  siteId: string;
  pageId: string;
  title: string;
  path: string;
  pageNumber: number;
}

export interface PublicSiteEntry {
  id: string;
  name: string;
  slug: string;
  pathPrefix: string;
  pages: PublicPageEntry[];
}

export interface PublicMessengerProtectedEntry extends PublicEncryptedBlob {
  prompt: string;
  failureMessage: string;
}

export interface PublicMessengerMatcherEntry extends PublicEncryptedBlob {
  id: string;
  label: string;
  mode: MatchMode;
}

export interface PublicMessengerNode {
  id: string;
  senderId: string;
  kind: MessengerNodeKind;
  body: string;
  protectedEntries?: PublicMessengerProtectedEntry[];
  choices: MessengerChoice[];
  matchers: PublicMessengerMatcherEntry[];
  delayMs?: number;
  effects: StoryEffect[];
}

export interface PublicMessengerThread {
  id: string;
  title: string;
  participants: MessengerParticipant[];
  nodes: PublicMessengerNode[];
}

export interface PublicRuntimePayload {
  schemaVersion: 2;
  generatedAt: string;
  storyNamespace: string;
  genericFailure: string;
  sites: PublicSiteEntry[];
  pages: PublicPageEntry[];
  storyEffects: Array<{ trigger: StoryTrigger; prerequisiteMode: StoryPrerequisiteMode; requiredEventIds?: string[]; effects: StoryEffect[] }>;
  messengerThreads: PublicMessengerThread[];
  reveal: PublicRevealEntry[];
  unlock: PublicUnlockEntry[];
  search: PublicSearchEntry[];
}
