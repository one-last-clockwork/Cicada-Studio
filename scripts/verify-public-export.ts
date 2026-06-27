import { buildPublicExportZip } from '../src/lib/export-public/publicExport';
import { checkPublicExportZip } from '../src/lib/export-public/checkLeaks';
import { createId, createPage, createProject } from '../src/lib/projects/createProject';

const project = createProject('CI Public Export Verification');
project.pages[0].bodyHtml = '<main><h1>Public verification</h1><div data-search-widget="default"></div></main>';
project.pages[0].memo = 'memo must not leak';
project.pages[0].revealBlocks.push({
  id: createId('reveal'),
  label: 'CI reveal',
  prompt: 'Phrase',
  answerAliases: ['ci reveal passphrase', 'ＣＩ　ＲＥＶＥＡＬ　ＰＡＳＳＰＨＲＡＳＥ'],
  secretHtml: '<p>ci reveal payload must not leak</p>',
  failureMessage: 'no'
});
project.pages[0].unlockPages.push({
  id: createId('unlock'),
  label: 'CI unlock',
  path: '../unsafe.html',
  prompt: 'Phrase',
  answerAliases: ['ci unlock passphrase'],
  payloadHtml: '<main>ci unlock payload must not leak</main>',
  failureMessage: 'no'
});
project.pages.push(
  createPage({
    title: 'CI Draft',
    status: 'draft',
    bodyHtml: '<main>ci draft payload must not leak</main>',
    memo: 'ci draft memo must not leak',
    pageNumber: 2
  })
);
project.searchRules.push({
  id: createId('search'),
  label: 'CI Search',
  terms: ['ci search term'],
  aliases: ['ci alias term'],
  mode: 'contains',
  targetPageId: project.pages[0].id,
  hint: '',
  failureMessage: 'no'
});
project.conditions.push({
  id: createId('condition'),
  label: 'CI condition',
  sourcePageId: project.pages[0].id,
  targetPageId: project.pages[0].id,
  publicHint: 'public hint',
  internalNote: 'ci internal condition must not leak'
});
project.flowcharts[0].name = 'ci flowchart must not leak';

const zip = await buildPublicExportZip(project);
const result = await checkPublicExportZip(zip, project);

if (!result.ok) {
  console.error(JSON.stringify(result.findings, null, 2));
  process.exit(1);
}

console.log(`Public export verification passed with ${result.files.length} files.`);
