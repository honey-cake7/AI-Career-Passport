import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Check current tracked + intended untracked files without reading ignored .env files.
// Report locations only; never print a matched credential. This is not a history scan.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|gsk_[A-Za-z0-9]{30,})\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s@]+@/,
];
const hits = [];
for (const file of files) {
  if (file.endsWith('.env.example')) continue;
  const buffer = readFileSync(resolve(root, file));
  if (buffer.includes(0)) continue;
  const lines = buffer.toString('utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (patterns.some(pattern => pattern.test(line))) hits.push(`${file}:${index + 1}`);
  });
}
if (hits.length) {
  console.error('Potential credentials found (values redacted):\n' + hits.join('\n'));
  process.exitCode = 1;
} else console.log(`Secret pattern scan passed for ${files.length} tracked/intended files; ignored environment files excluded.`);
