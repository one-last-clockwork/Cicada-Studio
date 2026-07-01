import type { StudioPage, StudioProject, StudioSite, StudioTheme } from '../../types/project';

export interface PageRef {
  site: StudioSite;
  page: StudioPage;
}

export interface ThemeRef {
  site: StudioSite;
  theme: StudioTheme;
}

export function primarySite(project: StudioProject): StudioSite {
  return project.sites.find((site) => site.id === project.primarySiteId) ?? project.sites[0];
}

export function siteById(project: StudioProject, siteId: string): StudioSite {
  return project.sites.find((site) => site.id === siteId) ?? primarySite(project);
}

export function allPageRefs(project: StudioProject): PageRef[] {
  return project.sites.flatMap((site) => site.pages.map((page) => ({ site, page })));
}

export function allPages(project: StudioProject): StudioPage[] {
  return allPageRefs(project).map((ref) => ref.page);
}

export function allThemeRefs(project: StudioProject): ThemeRef[] {
  return project.sites.flatMap((site) => site.themes.map((theme) => ({ site, theme })));
}

export function findPageRef(project: StudioProject, pageId: string): PageRef | undefined {
  return allPageRefs(project).find((ref) => ref.page.id === pageId);
}

export function findThemeRef(project: StudioProject, themeId: string): ThemeRef | undefined {
  return allThemeRefs(project).find((ref) => ref.theme.id === themeId);
}

export function updateSite(project: StudioProject, siteId: string, updater: (site: StudioSite) => StudioSite): StudioProject {
  return {
    ...project,
    sites: project.sites.map((site) => (site.id === siteId ? updater(site) : site))
  };
}

export function updatePageInProject(project: StudioProject, pageId: string, updater: (page: StudioPage) => StudioPage): StudioProject {
  const ref = findPageRef(project, pageId);
  if (!ref) {
    return project;
  }
  return updateSite(project, ref.site.id, (site) => ({
    ...site,
    pages: site.pages.map((page) => (page.id === pageId ? updater(page) : page))
  }));
}

export function updateThemeInProject(project: StudioProject, themeId: string, updater: (theme: StudioTheme) => StudioTheme): StudioProject {
  const ref = findThemeRef(project, themeId);
  if (!ref) {
    return project;
  }
  return updateSite(project, ref.site.id, (site) => ({
    ...site,
    themes: site.themes.map((theme) => (theme.id === themeId ? updater(theme) : theme))
  }));
}
