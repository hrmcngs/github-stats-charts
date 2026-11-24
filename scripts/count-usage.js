'use strict';

// 公開導入リポジトリを発見・検証し、確認済み一覧と取得状態を保存する。
const fs = require('node:fs');
const REPO = 'hrmcngs/github-stats-charts';
const TOPIC = 'github-stats-charts-user';
const SEEDS = ['hrmcngs/hrmcngs', 'yuqiuwuu/yuqiuwuu'];
const validRepo = (name) => typeof name === 'string' && /^[\w.-]+\/[\w.-]+$/.test(name);

function createApi(token = '') {
  let requests = 0;
  let exhausted = false;
  return async (path) => {
    if (exhausted || ++requests > (token ? 4500 : 45)) {
      throw Object.assign(new Error('GitHub request budget exhausted; resume next collection'), { status: 429 });
    }
    const response = await fetch('https://api.github.com' + path, {
      headers: {
        Accept: 'application/vnd.github+json', 'User-Agent': 'github-stats-charts-counter',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) exhausted = true;
      const error = new Error(`GitHub HTTP ${response.status}: ${path}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
}

async function readFile(api, repo, file) {
  try {
    const result = await api(`/repos/${repo}/contents/${file}`);
    if (result.type !== 'file' || result.encoding !== 'base64') {
      throw new Error(`Unreadable file: ${repo}/${file}`);
    }
    return Buffer.from(result.content, 'base64').toString('utf8');
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function verifyRepo(api, name) {
  let repo;
  try { repo = await api(`/repos/${name}`); }
  catch (error) {
    // A previously public repository may now be private; it must no longer be listed.
    if (error.status === 404 || error.status === 410) return null;
    throw error;
  }
  if (repo.private || repo.disabled || repo.full_name.toLowerCase() === REPO) return null;
  const canonical = repo.full_name.toLowerCase();
  const record = await readFile(api, canonical, '.github/github-stats-charts.json');
  let registered = false;
  if (record) {
    try {
      const data = JSON.parse(record);
      registered = data.source === REPO && data.repository?.toLowerCase() === canonical;
    } catch { /* 不正な登録ファイルを利用証明にはしない */ }
  }
  // コピーされたテンプレートや単なるforkは、導入記録がある場合だけ検証する。
  if ((repo.fork || repo.is_template) && !registered) return null;
  const generator = await readFile(api, canonical, 'scripts/gen-charts.js');
  if (generator && /\bGHSCharts\b/.test(generator) && /\bCONFIG\s*=/.test(generator)
      && /\buser\s*:\s*['"][^'"]+['"]/.test(generator)
      && /\bGHSCharts\.(radar|hbar|bars3d)\b/.test(generator)) {
    const chart = await readFile(api, canonical, 'src/js/charts.js');
    if (chart?.includes('GHSCharts') && chart.includes('function radar')) {
      return { repository: canonical, evidence: 'generator', registered };
    }
  }
  // READMEの紹介リンクだけでは数えず、実際のHTMLスクリプト埋め込みを確認する。
  const html = await readFile(api, canonical, 'index.html');
  if (html && /<[^>]+\bdata-github-user\s*=/.test(html)
      && /<script\b[^>]*\bsrc\s*=\s*["']https:\/\/cdn\.jsdelivr\.net\/gh\/hrmcngs\/github-stats-charts@[^/"']+\/src\/js\/embed\.js["']/i.test(html)) {
    return { repository: canonical, evidence: 'html-embed', registered };
  }
  return null;
}

async function collectUsage({ api, previous = {}, seeds = SEEDS, now = new Date().toISOString(), codeSearch = false }) {
  const warnings = [];
  const candidates = new Set([...(previous.repos || []), ...seeds, ...(previous.pendingRepos || [])].filter(validRepo).map(s => s.toLowerCase()));
  const previousRecords = new Map((previous.records || []).map(record => [record.repository, record]));
  let stopped = false;
  let stats = previous.stats || { stars: null, forks: null };
  try {
    const data = await api('/repos/' + REPO);
    if (!Number.isSafeInteger(data.stargazers_count) || !Number.isSafeInteger(data.forks_count)) throw new Error('Invalid repository statistics');
    stats = { stars: data.stargazers_count, forks: data.forks_count };
  } catch (error) {
    warnings.push(error.message);
    stopped = error.status === 403 || error.status === 429;
  }
  async function search(kind, query) {
    if (stopped) return;
    try {
      for (let page = 1; page <= 10; page++) {
        const result = await api(`/search/${kind}?q=${encodeURIComponent(query)}&per_page=100&page=${page}`);
        if (!Array.isArray(result.items)) throw new Error(`Invalid ${kind} search response`);
        if (result.incomplete_results) warnings.push(`Incomplete ${kind} search: ${query}`);
        for (const item of result.items) {
          const name = kind === 'code' ? item.repository?.full_name : item.full_name;
          if (validRepo(name)) candidates.add(name.toLowerCase());
        }
        if (result.items.length < 100) break;
        if (page === 10 && result.total_count > 1000) warnings.push(`Search capped at 1000: ${query}`);
      }
    } catch (error) {
      warnings.push(error.message);
      stopped = error.status === 403 || error.status === 429;
    }
  }
  await search('repositories', `topic:${TOPIC}`);
  // コード検索の認証に依存せず、READMEに書かれた旧インストーラーも発見する。
  await search('repositories', '"github.com/hrmcngs/github-stats-charts" in:readme');
  await search('repositories', '"raw.githubusercontent.com/hrmcngs/hrmcngs/main/bootstrap.sh" in:readme');
  if (codeSearch) await search('code', `"${REPO}" -repo:${REPO}`);
  candidates.delete(REPO);

  const records = [];
  const pendingRepos = [];
  for (const name of candidates) {
    try {
      if (stopped) throw new Error('Deferred until next collection');
      const verified = await verifyRepo(api, name);
      if (verified) records.push({ ...verified, lastVerifiedAt: now, status: 'verified' });
    } catch (error) {
      if (!stopped) warnings.push(`${name}: ${error.message}`);
      if (error.status === 403 || error.status === 429) stopped = true;
      pendingRepos.push(name);
      if ((previous.repos || []).includes(name)) {
        records.push({ ...previousRecords.get(name), repository: name,
          lastVerifiedAt: previousRecords.get(name)?.lastVerifiedAt || previous.lastSuccessfulAt || null,
          status: 'unavailable' });
      }
    }
  }
  // リネーム・検索結果の重複をcanonical名で除去する。
  const unique = new Map();
  for (const record of records) {
    if (!unique.has(record.repository) || record.status === 'verified') unique.set(record.repository, record);
  }
  const sorted = [...unique.values()].sort((a, b) => a.repository.localeCompare(b.repository));
  return {
    schemaVersion: 1, label: 'used by', message: `${sorted.length}+`,
    color: sorted.length ? 'blue' : 'lightgray', namedLogo: 'github', cacheSeconds: 3600,
    metric: 'verified-public-installations', status: warnings.length ? 'partial' : 'ok',
    checkedAt: now, lastSuccessfulAt: warnings.length ? previous.lastSuccessfulAt || null : now,
    repos: sorted.map(record => record.repository), records: sorted, stats, warnings,
    pendingRepos,
  };
}

async function main() {
  const previous = fs.existsSync('.usage.json') ? JSON.parse(fs.readFileSync('.usage.json', 'utf8')) : {};
  // 旧データに統計値がない場合は、最後に表示していた数値バッジを引き継ぐ。
  previous.stats = previous.stats || {};
  for (const key of ['stars', 'forks']) {
    const file = `badges/${key}.svg`;
    if (previous.stats[key] == null && fs.existsSync(file)) {
      const match = /<title>[^:]+: ([\d,]+)<\/title>/.exec(fs.readFileSync(file, 'utf8'));
      if (match) previous.stats[key] = Number(match[1].replace(/,/g, ''));
    }
  }
  const result = await collectUsage({ api: createApi(process.env.GITHUB_TOKEN), previous,
    codeSearch: process.env.GHS_CODE_SEARCH === '1' });
  fs.writeFileSync('.usage.json', JSON.stringify(result, null, 2) + '\n');
  require('./badges.js').writeBadges('badges', {
    usage: result.message, stars: result.stats.stars ?? '?', forks: result.stats.forks ?? '?',
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'partial') console.warn('Partial collection; unavailable previous entries retained. See .usage.json.');
}

module.exports = { collectUsage, verifyRepo, createApi, TOPIC, REPO };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
