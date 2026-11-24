'use strict';

// インストール先の CONFIG を保持し、共通コードを同一コミットから更新する。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const repository = 'hrmcngs/github-stats-charts';
const start = '// ============================ 設定（ここを編集） ============================';
const end = '// ============================== 設定ここまで ==============================';

function configBlock(source) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error('CONFIG markers not found; update cancelled');
  return source.slice(from, to + end.length);
}

async function main() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'github-stats-charts' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, { headers });
  if (!response.ok) throw new Error(`Upstream commit: HTTP ${response.status}`);
  const { sha } = await response.json();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid upstream commit');

  const files = ['scripts/gen-charts.js', 'scripts/sync-upstream.js', 'scripts/register-installation.js', 'src/js/charts.js', 'src/js/github-stats.js', 'src/js/embed.js'];
  const updates = await Promise.all(files.map(async (file) => {
    const result = await fetch(`https://raw.githubusercontent.com/${repository}/${sha}/${file}`);
    if (!result.ok) throw new Error(`${file}: HTTP ${result.status}`);
    return [file, await result.text()];
  }));
  const generator = updates.find(([file]) => file === 'scripts/gen-charts.js');
  const localPath = path.join(root, generator[0]);
  if (fs.existsSync(localPath)) {
    generator[1] = generator[1].replace(configBlock(generator[1]), configBlock(fs.readFileSync(localPath, 'utf8')));
  } else {
    configBlock(generator[1]);
  }
  // 全ファイルの取得と設定確認が成功してから書き込む。
  for (const [file, source] of updates) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
  }
  console.log(`Updated shared chart code from ${repository}@${sha}; CONFIG preserved`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
