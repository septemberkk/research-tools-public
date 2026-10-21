import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  applyMappingToTable, buildMappingExports, mappingCanonicalText, parseMapping, sha256,
} from '../category-color-mapping.js';
import { serializeTableCsv } from '../csv.js';

export async function runExample() {
  const master = parseMapping(await readFile(new URL('./mapping.json', import.meta.url), 'utf8'));
  const input = await readFile(new URL('./observations.csv', import.meta.url), 'utf8');
  const result = applyMappingToTable(input, master.mapping, { categoryColumn: 'group' });
  return {
    csv: serializeTableCsv(result.table),
    report: result.report,
    exports: buildMappingExports(master.mapping, master.mapping_name),
    mapping_sha256: await sha256(mappingCanonicalText(master.mapping)),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runExample();
    console.log(result.csv);
    console.log(JSON.stringify({
      report: result.report, mapping_sha256: result.mapping_sha256,
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
