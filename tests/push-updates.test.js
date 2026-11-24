'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";

for (const [workflow, generated] of [
  ['usage-counter.yml', '.usage.json'],
  ['update-charts.yml', 'charts/activity.svg'],
]) {
  test(`${workflow}: retries rejected push and preserves both writers`, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ghs-push-'));
    try {
      const remote = path.join(temporary, 'remote.git');
      const worker = path.join(temporary, 'worker');
      const racer = path.join(temporary, 'racer');
      const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false' };
      const git = (args, cwd = temporary) => execFileSync(realGit, args, {
        cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      git(['init', '--bare', '--initial-branch=main', remote]);
      git(['clone', remote, worker]);
      for (const name of ['badges', 'charts', 'scripts', 'src/js']) {
        const directory = path.join(worker, name);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, '.gitkeep'), '');
      }
      fs.writeFileSync(path.join(worker, '.usage.json'), '{}\n');
      fs.writeFileSync(path.join(worker, 'README.md'), 'initial\n');
      git(['add', '.'], worker);
      git(['commit', '-m', 'Initial'], worker);
      git(['push', 'origin', 'main'], worker);
      git(['clone', remote, racer]);
      fs.writeFileSync(path.join(racer, 'README.md'), 'concurrent update\n');
      git(['add', 'README.md'], racer);
      git(['commit', '-m', 'Concurrent update'], racer);
      fs.writeFileSync(path.join(worker, generated), 'generated update\n');

      // Advance the remote after fetch/rebase, immediately before the first push.
      const binary = path.join(temporary, 'bin');
      const marker = path.join(temporary, 'raced');
      fs.mkdirSync(binary);
      fs.writeFileSync(path.join(binary, 'git'), '#!/bin/sh\n'
        + `if [ "$1" = push ] && [ ! -f ${quote(marker)} ]; then\n`
        + `  touch ${quote(marker)}\n`
        + `  ${quote(realGit)} -C ${quote(racer)} push origin main || exit 1\n`
        + 'fi\n'
        + `exec ${quote(realGit)} "$@"\n`, { mode: 0o755 });
      const source = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
      const step = source.slice(source.indexOf('      - name: Commit'));
      const script = step.split('        run: |\n')[1].replace(/^          /gm, '');
      const jobEnv = { ...env, PATH: binary + path.delimiter + env.PATH, TARGET_BRANCH: 'main' };
      const run = () => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
        cwd: worker, env: jobEnv, encoding: 'utf8',
      });
      const result = run();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.ok(fs.existsSync(marker));
      assert.match(result.stderr, /\[rejected\]/);
      assert.equal(git([`--git-dir=${remote}`, 'show', 'main:README.md']), 'concurrent update\n');
      assert.equal(git([`--git-dir=${remote}`, 'show', `main:${generated}`]), 'generated update\n');
      assert.equal(git(['status', '--porcelain'], worker), '');

      // No changes must succeed without creating another commit.
      const head = git(['rev-parse', 'HEAD'], worker);
      const unchanged = run();
      assert.equal(unchanged.status, 0, unchanged.stdout + unchanged.stderr);
      assert.equal(git(['rev-parse', 'HEAD'], worker), head);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
}
