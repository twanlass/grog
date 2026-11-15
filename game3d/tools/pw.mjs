// Playwright is not a dependency of this package (it is ~100 MB and only the tools want it), so
// resolve a local install first and fall back to a global one (`npm i -g playwright`).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

export async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  const root = execSync('npm root -g').toString().trim();
  return createRequire(`${root}/`)('playwright');
}
