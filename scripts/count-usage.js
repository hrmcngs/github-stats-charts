// "Use this template" 以外の利用も含めたカウントを集計し .usage.json に書き出す。
// 出力は shields.io endpoint 形式の JSON で、README のバッジから参照される。
//
// 数えるのは「ヒットしたファイル数」ではなく「利用しているリポジトリ数」。
// 1 リポジトリに gen-charts.js / charts.js / update-charts.yml と複数の
// マーカーが入るため、ファイル単位で数えると 1 件の導入が 3 件に膨らむ。
//
// 収集元（すべて重複排除して 1 つの Set に集約）:
//   1. fork          : GitHub API（/repos/.../forks）
//   2. コード検索    : 配布ファイル冒頭のマーカー "hrmcngs/github-stats-charts"
//                      （bootstrap.sh 経由の導入もこれで拾える）
//   3. 旧シグネチャ  : マーカー導入前に bootstrap した分（gen-charts.js の中身で判定）
//   4. raw URL 参照  : README 等に raw.githubusercontent.com のURLを貼っている場合
//   5. 手動登録      : KNOWN_REPOS（下記）。実在＋配布ファイルの有無を検証してから数える
//
// "Used by"（HTML スクレイプ）は重複排除できないため加算せず、
// 集約結果との最大値をとるだけの保険として扱う。
//
// 注意: GitHub のコード検索は public リポジトリのみが対象で、インデックス反映まで
//       数時間〜数日かかる。リポジトリによっては長期間インデックスされないことも
//       あるため、確実に数えたい導入先は KNOWN_REPOS に書く。

const fs = require('fs');

const REPO = 'hrmcngs/github-stats-charts';

// 手動登録の導入先。コード検索のインデックス漏れを補うためのもので、
// 「書いたら無条件で +1」ではなく、public かつ配布ファイルが実在する場合のみ数える。
const KNOWN_REPOS = [
  'yuqiuwuu/yuqiuwuu',
];

// 導入されていることを確認するためのファイル（いずれか 1 つあれば導入済みとみなす）
const MARKER_FILES = [
  'scripts/gen-charts.js',
  'src/js/charts.js',
  '.github/workflows/update-charts.yml',
];
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

// コード検索の結果からリポジトリ名（owner/repo）の集合を返す。
// search/code は 1 ページ最大 100 件・合計 1000 件までなので上限までページングする。
async function searchRepos(q) {
  const found = new Set();
  try {
    for (let page = 1; page <= 10; page++) {
      const url = '/search/code?q=' + encodeURIComponent(q) + '&per_page=100&page=' + page;
      const d = await api(url);
      const items = d.items || [];
      for (const it of items) {
        const name = it.repository && it.repository.full_name;
        if (name) found.add(name.toLowerCase());
      }
      if (items.length < 100) break;
    }
  } catch (e) {
    console.warn('search failed:', e.message);
  }
  return found;
}

async function forkRepos() {
  const found = new Set();
  try {
    for (let page = 1; page <= 10; page++) {
      const d = await api(`/repos/${REPO}/forks?per_page=100&page=${page}`);
      for (const f of d) if (f.full_name) found.add(f.full_name.toLowerCase());
      if (d.length < 100) break;
    }
  } catch (e) {
    console.warn('forks failed:', e.message);
  }
  return found;
}

// KNOWN_REPOS のうち、実際に public で配布ファイルを持っているものだけを返す。
async function verifyKnownRepos() {
  const found = new Set();
  for (const name of KNOWN_REPOS) {
    let repo;
    try {
      repo = await api('/repos/' + name);
    } catch (e) {
      console.warn(`known repo ${name}: 取得できず (${e.message})`);
      continue;
    }
    if (repo.private) {
      console.warn(`known repo ${name}: private のためスキップ`);
      continue;
    }
    let ok = false;
    for (const f of MARKER_FILES) {
      try {
        await api(`/repos/${name}/contents/${f}`);
        ok = true;
        break;
      } catch (e) { /* 次のファイルを試す */ }
    }
    if (ok) found.add(repo.full_name.toLowerCase());
    else console.warn(`known repo ${name}: 配布ファイルが見つからずスキップ`);
  }
  return found;
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
  let stars = 0;
  try {
    const repoData = await api('/repos/' + REPO);
    stars = repoData.stargazers_count || 0;
  } catch (e) {
    console.warn('repo info failed:', e.message);
  }

  const forks = await forkRepos();
  // 配布ファイルのマーカー（"powered by https://github.com/hrmcngs/github-stats-charts"）
  const code  = await searchRepos(`"${REPO}" -repo:${REPO}`);
  // マーカー導入前に bootstrap した分（gen-charts.js の中身そのもので判定）
  const legacy = await searchRepos(`GHSCharts filename:gen-charts.js -repo:${REPO}`);
  // raw URL をそのまま README 等に貼っているケース
  const raw   = await searchRepos(`"raw.githubusercontent.com/${REPO}" -repo:${REPO}`);
  // 手動登録（実在確認済みのみ）
  const known = await verifyKnownRepos();

  const repos = new Set([...forks, ...code, ...legacy, ...raw, ...known]);
  repos.delete(REPO.toLowerCase());   // 自分自身は数えない

  // 重複排除できないベストエフォート値。加算はせず下限としてだけ使う。
  const usedBy = await scrapeUsedBy();
  const total  = Math.max(repos.size, usedBy);

  console.log(JSON.stringify({
    stars,
    forks: forks.size,
    codeRepos: code.size,
    legacyRepos: legacy.size,
    rawRepos: raw.size,
    knownRepos: known.size,
    uniqueRepos: repos.size,
    usedBy,
    total,
    repos: [...repos].sort(),
  }, null, 2));

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
