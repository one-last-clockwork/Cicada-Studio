export type StudioTab = 'intro' | 'projects' | 'dashboard' | 'pages' | 'editor' | 'assets' | 'themes' | 'flowchart' | 'search' | 'conditions' | 'export';

export const studioTabs: Array<{ id: StudioTab; label: string }> = [
  { id: 'intro', label: 'System Guide' },
  { id: 'projects', label: 'Projects' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'pages', label: 'Pages' },
  { id: 'editor', label: 'Editor' },
  { id: 'assets', label: 'Assets' },
  { id: 'themes', label: 'Themes' },
  { id: 'flowchart', label: 'Flowchart' },
  { id: 'search', label: 'Search' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'export', label: 'Export' }
];
