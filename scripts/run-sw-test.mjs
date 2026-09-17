// Prépare une copie du site sur un port LIBRE choisi dynamiquement, puis lance
// le test de mise à jour du service worker (qui modifie le site en cours de
// route). Le port fixe d'origine était un piège : un serveur resté en vie d'un
// lancement précédent continuait de répondre en servant un dossier périmé, et
// faisait échouer tous les lancements suivants pour une raison sans rapport.
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const freePort = () => new Promise(res => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});

const dir  = mkdtempSync(join(tmpdir(), 'eurocad-sw-'));
const port = await freePort();
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'icons']) {
  cpSync(f, join(dir, f), { recursive: true });
}

const srv = spawn('python3', ['-m', 'http.server', String(port)], { cwd: dir, stdio: 'ignore' });
const cleanup = () => {
  try { srv.kill('SIGKILL'); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
await new Promise(r => setTimeout(r, 1200));

const res = spawnSync('node', ['scripts/sw-update.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, SW_TEST_DIR: dir, SW_TEST_URL: `http://127.0.0.1:${port}/` },
});
cleanup();
process.exit(res.status ?? 1);
