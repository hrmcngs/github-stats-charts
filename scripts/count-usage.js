// "Use this template" 以外の利用も含めたカウントを集計し .usage.json に書き出す。
// 出力は shields.io endpoint 形式の JSON で、README のバッジから参照される。
//
// 集計対象:
//   1. fork 数                    : GitHub API
//   2. "Used by" 数（テンプレート）: リポジトリ HTML をスクレイプ（公式 API なし・ベストエフォート）
//   3. コード検索ヒット数         : 他リポジトリで "hrmcngs/github-stats-charts" を含むファイル数
//
// 重複を避けるため、コードヒットは raw URL のヒットと最大値で集約し、
// total = forks + codeHits + usedBy としている。

const fs = require('fs');

const REPO = 'hrmcngs/github-stats-charts';
const TOKEN = process.env.GITHUB_TOKEN || '';
const UA = 'github-stats-charts-counter';
const HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': UA,
  ...(TOKEN ? { 'Authorization': 'Bearer ' + TOKEN } : {}),
};

async function api(path) {
  const r = await fetch('https://api.github.com' + path, { headers: HEADERS });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${path}: ${r.status} ${body.slice(0, 120)}`);
  }
  return r.json();
}

async function search(q) {
  const url = '/search/code?q=' + encodeURIComponent(q) + '&per_page=1';
  try {
    const d = await api(url);
    return d.total_count || 0;
  } catch (e) {
    console.warn('search failed:', e.message);
    return 0;
  }
}

async function scrapeUsedBy() {
  // テンプレートリポジトリの "Used by N" は公式 API では取れないので HTML をスクレイプ
  try {
    const r = await fetch('https://github.com/' + REPO, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    });
    if (!r.ok) return 0;
    const html = await r.text();
    // 例: <a href="/<owner>/<repo>/network/dependents" ...><svg.../> Used by <span title="1,234">1.2k</span>
    let m = /Used by[\s\S]{0,400}?title="([\d,]+)"/.exec(html);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10) || 0;
    // 別パターン（数字直接）
    m = /Used by[\s\S]{0,400}?>(\d[\d,]*)</.exec(html);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10) || 0;
    return 0;
  } catch (e) {
    console.warn('scrape failed:', e.message);
    return 0;
  }
}

(async () => {
  let forks = 0, stars = 0;
  try {
    const repoData = await api('/repos/' + REPO);
    forks = repoData.forks_count || 0;
    stars = repoData.stargazers_count || 0;
  } catch (e) {
    console.warn('repo info failed:', e.message);
  }

  // 他リポジトリで "owner/repo" を直接参照しているコード
  const codeHits = await search(`"${REPO}" -repo:${REPO}`);
  // raw URL をそのまま README 等に貼っているケース
  const rawHits  = await search(`"raw.githubusercontent.com/${REPO}" -repo:${REPO}`);
  // テンプレート利用数（ベストエフォート）
  const usedBy   = await scrapeUsedBy();

  // 重複を避けて最大値で集約（raw URL のヒットは概ね codeHits に含まれる）
  const fromCode = Math.max(codeHits, rawHits);
  const total    = forks + fromCode + usedBy;

  console.log(JSON.stringify({ forks, stars, codeHits, rawHits, usedBy, total }, null, 2));

  const out = {
    schemaVersion: 1,
    label: 'used by',
    message: String(total),
    color: total > 0 ? 'blue' : 'lightgray',
    namedLogo: 'github',
    cacheSeconds: 3600,
  };
  fs.writeFileSync('.usage.json', JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote .usage.json (message=' + out.message + ')');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
