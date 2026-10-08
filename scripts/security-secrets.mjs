import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const environment = require('dotenv').parse(await readFile(join(root, '.env')));
const credentials = JSON.parse(
  await readFile(join(root, '.data/secrets/initial-admin.json'), 'utf8'),
);
const secrets = Object.entries(environment).filter(
  ([name, value]) => /SECRET|PASSWORD|API_KEY/.test(name) && value.length >= 8,
);
secrets.push(['ADMIN_PASSWORD', credentials.password]);
const needles = secrets.map(([name, value]) => ({ name, bytes: Buffer.from(value) }));
const files = execFileSync(
  'git',
  ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'ls-files', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const leaks = [];
for (const file of files) {
  const bytes = await readFile(join(root, file));
  for (const needle of needles)
    if (bytes.includes(needle.bytes)) leaks.push(`${file}: ${needle.name}`);
}
if (process.argv[2]) {
  const yauzl = require('yauzl');
  await new Promise((resolve, reject) =>
    yauzl.open(process.argv[2], { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error('APK unreadable'));
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            zip.close();
            reject(error ?? new Error('APK entry unreadable'));
            return;
          }
          let tail = Buffer.alloc(0);
          const overlap = Math.max(...needles.map((item) => item.bytes.length));
          stream.on('data', (chunk) => {
            const bytes = Buffer.concat([tail, chunk]);
            for (const needle of needles)
              if (bytes.includes(needle.bytes)) leaks.push(`APK ${entry.fileName}: ${needle.name}`);
            tail = bytes.subarray(Math.max(0, bytes.length - overlap));
          });
          stream.on('error', reject);
          stream.on('end', () => zip.readEntry());
        });
      });
      zip.readEntry();
    }),
  );
}
if (leaks.length) throw new Error('Secrets found (values withheld): ' + leaks.join(', '));
console.log(
  `PASS: ${files.length} tracked files${process.argv[2] ? ' and decompressed APK contents' : ''} scanned; actual administrator/service credentials were not found.`,
);
