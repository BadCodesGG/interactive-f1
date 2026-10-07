/** `npm run check:sidecar`: see scripts/lib/check-sidecar.mjs for what it enforces. */
import { checkSidecars } from "./lib/check-sidecar.mjs";

const { files, errors } = await checkSidecars();
for (const f of files) console.log(`checked src/data/${f}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log(`ok   ${files.length} sidecar(s) match their models and copy books`);
