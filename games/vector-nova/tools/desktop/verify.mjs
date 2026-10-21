import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { editionPolicy } from './policy.mjs';
const edition = process.argv[2];
editionPolicy(edition);
const archiveOption = process.argv.indexOf('--archive');
const stage =
  archiveOption >= 0
    ? resolve(process.argv[archiveOption + 1])
    : resolve(import.meta.dirname, '../../.desktop', edition);
const profile = await mkdtemp(join(tmpdir(), 'vector-nova-verify-'));
try {
  for (const restart of ['0', '1']) {
    const code = await new Promise((done, reject) => {
      const child = spawn(
        createRequire(import.meta.url)('electron'),
        [resolve(import.meta.dirname, 'probe.cjs')],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            VN_PROBE_STAGE: stage,
            VN_PROBE_EDITION: edition,
            VN_PROBE_PROFILE: profile,
            VN_PROBE_RESTART: restart,
          },
        },
      );
      const timeout = setTimeout(
        () => {
          child.kill('SIGKILL');
          reject(
            new Error(`Desktop ${edition} verification exceeded 15 minutes`),
          );
        },
        15 * 60 * 1000,
      );
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        done(code);
      });
    });
    if (code !== 0)
      throw new Error(`Desktop ${edition} verification failed (${code})`);
  }
} finally {
  await rm(profile, { recursive: true, force: true });
}
