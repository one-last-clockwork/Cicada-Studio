export type StudioTab =
  | 'intro'
  | 'projects'
  | 'dashboard'
  | 'sites'
  | 'pages'
  | 'editor'
  | 'assets'
  | 'themes'
  | 'storyMap'
  | 'messenger'
  | 'search'
  | 'conditions'
  | 'export';

export const studioTabs: Array<{ id: StudioTab; label: string }> = [
  { id: 'intro', label: 'System Guide' },
  { id: 'projects', label: 'Projects' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sites', label: 'Sites' },
  { id: 'pages', label: 'Pages' },
  { id: 'editor', label: 'Editor' },
  { id: 'assets', label: 'Assets' },
  { id: 'themes', label: 'Themes' },
  { id: 'storyMap', label: 'Story Map' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'search', label: 'Search' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'export', label: 'Export' }
];
