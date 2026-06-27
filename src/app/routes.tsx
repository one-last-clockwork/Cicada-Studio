export type StudioTab = 'dashboard' | 'pages' | 'editor' | 'assets' | 'themes' | 'flowchart' | 'search' | 'conditions' | 'export';

export const studioTabs: Array<{ id: StudioTab; label: string }> = [
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
