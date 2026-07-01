import type {
  AnyStudioProject,
  LegacyStudioFlowchart,
  LegacyStudioProject,
  MessengerThread,
  StoryMapEdge,
  StoryMapNode,
  StudioProject,
  StudioSite,
  StudioStoryMap
} from '../../types/project';
import { safeSlug } from '../path-safety/pathSafety';
import { createDefaultSite, createDefaultStoryMap, createDefaultStoryState, createId, nowIso } from './createProject';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasV2Shape(project: unknown): project is StudioProject {
  return isRecord(project) && project.schemaVersion === 2 && Array.isArray(project.sites);
}

function hasV1Shape(project: unknown): project is LegacyStudioProject {
  return isRecord(project) && (project.schemaVersion === 1 || Array.isArray(project.pages));
}

function storyNamespaceForProject(project: { id?: string; name?: string }): string {
  return safeSlug(project.id || project.name || 'story', 'story');
}

function migrateNode(flow: LegacyStudioFlowchart, node: LegacyStudioFlowchart['nodes'][number], site: StudioSite, index: number): StoryMapNode {
  const page = node.pageId ? site.pages.find((item) => item.id === node.pageId) : undefined;
  return {
    id: node.id || createId('node'),
    label: node.label || page?.title || `Node ${index + 1}`,
    type: page ? 'page' : 'discovery',
    linkedEntity: page ? { kind: 'page', siteId: site.id, pageId: page.id, id: page.id } : undefined,
    siteId: page ? site.id : undefined,
    pageId: page?.id,
    notes: flow.name ? `Migrated from ${flow.name}.` : '',
    tags: [],
    x: Number.isFinite(node.x) ? node.x : 80 + index * 120,
    y: Number.isFinite(node.y) ? node.y : 80
  };
}

function migrateStoryMaps(flowcharts: LegacyStudioFlowchart[] | undefined, site: StudioSite): StudioStoryMap[] {
  const source = flowcharts?.length ? flowcharts : [];
  if (!source.length) {
    return [createDefaultStoryMap(site)];
  }
  return source.map((flow, flowIndex) => {
    const nodes = (flow.nodes ?? []).map((node, index) => migrateNode(flow, node, site, index));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: StoryMapEdge[] = (flow.edges ?? [])
      .filter((edge) => edge.source && edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({
        id: edge.id || createId('edge'),
        source: edge.source,
        target: edge.target,
        label: edge.label || 'Route',
        action: 'read',
        pathRole: 'intended',
        prerequisiteMode: 'permissive',
        notes: '',
        tags: [],
        effects: []
      }));
    return {
      id: flow.id || createId('story-map'),
      name: flow.name?.replace(/flowchart/gi, 'Story Map') || `Story Map ${flowIndex + 1}`,
      nodes,
      edges
    };
  });
}

function migrateMessengerThreads(value: unknown): MessengerThread[] {
  return Array.isArray(value) ? (value as MessengerThread[]) : [];
}

function normalizeV2Project(project: StudioProject): StudioProject {
  const fallbackSite = createDefaultSite();
  const sites = project.sites.length ? project.sites : [fallbackSite];
  const primarySiteId = sites.some((site) => site.id === project.primarySiteId) ? project.primarySiteId : sites[0].id;
  return {
    ...project,
    schemaVersion: 2,
    storyNamespace: project.storyNamespace || storyNamespaceForProject(project),
    primarySiteId,
    sites,
    storyMaps: project.storyMaps?.length ? project.storyMaps : [createDefaultStoryMap(sites[0])],
    messengerThreads: project.messengerThreads ?? [],
    storyState: project.storyState ?? createDefaultStoryState(),
    snapshots: (project.snapshots ?? []).map((snapshot) => ({
      ...snapshot,
      project: migrateProject(snapshot.project)
    }))
  };
}

function migrateV1Project(project: LegacyStudioProject): StudioProject {
  const createdAt = project.createdAt || nowIso();
  const site = createDefaultSite({
    id: createId('site'),
    name: 'Default Site',
    slug: 'default',
    pathPrefix: '',
    pages: project.pages ?? [],
    themes: project.themes ?? []
  });
  return {
    schemaVersion: 2,
    id: project.id || createId('project'),
    name: project.name || 'Imported Project',
    createdAt,
    updatedAt: project.updatedAt || createdAt,
    scriptPreviewEnabled: Boolean(project.scriptPreviewEnabled),
    storyNamespace: storyNamespaceForProject(project),
    primarySiteId: site.id,
    sites: [site],
    assets: project.assets ?? [],
    storyMaps: migrateStoryMaps(project.flowcharts, site),
    searchRules: project.searchRules ?? [],
    conditions: project.conditions ?? [],
    messengerThreads: migrateMessengerThreads((project as unknown as Record<string, unknown>).messengerThreads),
    storyState: createDefaultStoryState(),
    importedScripts: project.importedScripts ?? [],
    snapshots: (project.snapshots ?? []).map((snapshot) => ({
      ...snapshot,
      project: migrateProject(snapshot.project)
    }))
  };
}

export function migrateProject(project: unknown): StudioProject {
  if (hasV2Shape(project)) {
    return normalizeV2Project(project);
  }
  if (hasV1Shape(project)) {
    return migrateV1Project(project);
  }
  return createDefaultProjectFromUnknown(project);
}

function createDefaultProjectFromUnknown(project: unknown): StudioProject {
  const baseName = isRecord(project) && typeof project.name === 'string' ? project.name : 'Imported Project';
  const createdAt = nowIso();
  const site = createDefaultSite();
  return {
    schemaVersion: 2,
    id: createId('project'),
    name: baseName,
    createdAt,
    updatedAt: createdAt,
    scriptPreviewEnabled: false,
    storyNamespace: safeSlug(baseName, 'story'),
    primarySiteId: site.id,
    sites: [site],
    assets: [],
    storyMaps: [createDefaultStoryMap(site)],
    searchRules: [],
    conditions: [],
    messengerThreads: [],
    storyState: createDefaultStoryState(),
    importedScripts: [],
    snapshots: []
  };
}

export function isStudioProjectV2(project: AnyStudioProject): project is StudioProject {
  return project.schemaVersion === 2;
}
