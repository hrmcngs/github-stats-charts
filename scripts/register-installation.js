'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const SOURCE = 'hrmcngs/github-stats-charts';
const TOPIC = 'github-stats-charts-user';

function repositoryFromRemote(remote) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)\/?$/.exec(remote.trim());
  return match ? match[1].replace(/\.git$/, '').toLowerCase() : null;
}

function writeInstallation(root, repository) {
  if (!repository || repository === SOURCE) return;
  const file = path.join(root, '.github/github-stats-charts.json');
  let previous = {};
  if (fs.existsSync(file)) {
    try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* 記録を再作成 */ }
  }
  const same = previous.source === SOURCE && previous.repository === repository;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, source: SOURCE, repository,
    installedAt: same && previous.installedAt ? previous.installedAt : new Date().toISOString() }, null, 2) + '\n');
}

async function registerPublicTopic({ repository, request }) {
  const repo = await request(`/repos/${repository}`);
  if (repo.private || repo.visibility === 'private' || repo.visibility === 'internal') return 'private';
  const { names } = await request(`/repos/${repository}/topics`);
  if (!Array.isArray(names)) throw new Error('Invalid topics response');
  if (names.includes(TOPIC)) return 'registered';
  if (names.length >= 20) throw new Error('Repository already has 20 topics');
  await request(`/repos/${repository}/topics`, { method: 'PUT', body: JSON.stringify({ names: [...names, TOPIC] }) });
  return 'registered';
}

async function main() {
  if (process.env.GHS_REGISTER === '0') {
    console.log('利用登録をスキップしました (GHS_REGISTER=0)。');
    return;
  }
  const root = path.resolve(__dirname, '..');
  const repository = repositoryFromRemote(execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: root, encoding: 'utf8' }));
  if (!repository || repository === SOURCE) return;
  writeInstallation(root, repository);
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { /* 認証できない場合は手動登録を案内 */ }
  }
  console.log(`利用数の集計用に、公開リポジトリへトピック ${TOPIC} を追加します（非公開は登録しません）。`);
  if (!token) {
    console.warn(`自動登録には gh auth login または GH_TOKEN が必要です。認証後に node scripts/register-installation.js を再実行するか、公開リポジトリの Settings / About からトピック ${TOPIC} を追加してください。`);
    return;
  }
  const request = async (apiPath, options = {}) => {
    const response = await fetch('https://api.github.com' + apiPath, {
      ...options,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', 'User-Agent': 'github-stats-charts-installer' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return response.json();
  };
  try {
    const status = await registerPublicTopic({ repository, request });
    console.log(status === 'private' ? '非公開リポジトリのため公開登録は行いません。' : '公開利用登録が完了しました。導入ファイルのプッシュ後、集計時に検証されます。');
  } catch (error) {
    console.warn(`利用登録は未完了です (${error.message})。導入は続行します。リポジトリを管理できる認証で node scripts/register-installation.js を再実行してください。`);
  }
}

module.exports = { repositoryFromRemote, writeInstallation, registerPublicTopic };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
