import { readFile } from 'node:fs/promises';
import { checkPublicExportZip } from '../src/lib/export-public/checkLeaks';

const zipPath = process.argv[2];

if (!zipPath) {
  console.error('Usage: npm run check:export-leaks -- <public-export.zip>');
  process.exit(2);
}

const bytes = await readFile(zipPath);
const result = await checkPublicExportZip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

if (!result.ok) {
  console.error(JSON.stringify(result.findings, null, 2));
  process.exit(1);
}

console.log(`No export leaks found in ${result.files.length} files.`);
