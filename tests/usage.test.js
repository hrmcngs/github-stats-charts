'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collectUsage, TOPIC, REPO } = require('../scripts/count-usage.js');
const { registerPublicTopic, repositoryFromRemote, writeInstallation } = require('../scripts/register-installation.js');
const now = '2026-11-24T12:00:00Z';
const missing = () => { throw Object.assign(new Error('missing'), { status: 404 }); };
const content = text => ({ type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64') });
const generator = "const CONFIG = { user: 'user' }; GHSCharts.radar(items);";
const chart = 'const GHSCharts = {}; function radar() {}';

function fixture({ repositories = {}, matches = [], failing = [], partial = false } = {}) {
  return async url => {
    if (failing.some(fragment => url.includes(fragment))) throw Object.assign(new Error('temporarily unavailable'), { status: 503 });
    if (url.startsWith('/search/')) return { items: matches.map(full_name => ({ full_name })), incomplete_results: partial };
    if (url === `/repos/${REPO}`) return { stargazers_count: 3, forks_count: 10 };
    const match = /^\/repos\/([^/]+\/[^/]+)(?:\/contents\/(.+))?$/.exec(url);
    if (!match || !repositories[match[1]]) return missing();
    const [ , name, file] = match;
    const data = repositories[name];
    if (!file) return { full_name: name, private: false, ...data.metadata };
    if (!(file in (data.files || {}))) return missing();
    return content(data.files[file]);
  };
}
const installed = { files: { 'scripts/gen-charts.js': generator, 'src/js/charts.js': chart } };

test('deduplicates discovered repos and excludes mere forks, links and topic claims', async () => {
  const api = fixture({ matches: ['person/app', 'person/link', 'person/fork', 'person/claim'], repositories: {
    'person/app': installed,
    'person/link': { files: { 'index.html': '<a href="https://github.com/hrmcngs/github-stats-charts">example</a>' } },
    'person/fork': { ...installed, metadata: { fork: true } },
    'person/claim': { files: {} },
  } });
  const result = await collectUsage({ api, seeds: ['PERSON/APP'], now });
  assert.deepEqual(result.repos, ['person/app']);
  assert.equal(result.message, '1+');
  assert.equal(result.stats.forks, 10);
  assert.equal(result.status, 'ok');
  assert.equal(result.records[0].lastVerifiedAt, now);
});

test('counts registered forks with actual code, and actual HTML embeds', async () => {
  const api = fixture({ matches: ['person/fork', 'person/site'], repositories: {
    'person/fork': { ...installed, metadata: { fork: true }, files: { ...installed.files,
      '.github/github-stats-charts.json': JSON.stringify({ source: REPO, repository: 'person/fork' }) } },
    'person/site': { files: { 'index.html': '<div data-github-user="person"></div><script defer src="https://cdn.jsdelivr.net/gh/hrmcngs/github-stats-charts@main/src/js/embed.js"></script>' } },
  } });
  const result = await collectUsage({ api, seeds: [], now });
  assert.equal(result.repos.length, 2);
  assert.equal(result.records[0].registered, true);
  assert.equal(result.records[1].evidence, 'html-embed');
});

test('retains previous count and successful timestamp on API outage', async () => {
  const previous = { repos: ['person/app'], records: [{ repository: 'person/app', lastVerifiedAt: 'before' }], stats: { stars: 7, forks: 9 }, lastSuccessfulAt: 'before' };
  const result = await collectUsage({ api: async () => { throw new Error('offline'); }, previous, seeds: [], now });
  assert.deepEqual(result.repos, ['person/app']);
  assert.equal(result.status, 'partial');
  assert.equal(result.records[0].lastVerifiedAt, 'before');
  assert.equal(result.records[0].status, 'unavailable');
  assert.equal(result.lastSuccessfulAt, 'before');
  assert.equal(result.stats.stars, 7);
});

test('removes confirmed deleted, private and uninstalled repositories', async () => {
  const api = fixture({ repositories: { 'person/private': { metadata: { private: true } }, 'person/removed': { files: {} } } });
  const result = await collectUsage({ api, seeds: [], previous: { repos: ['person/deleted', 'person/private', 'person/removed'] }, now });
  assert.deepEqual(result.repos, []);
  assert.equal(result.message, '0+');
});

test('marks search incompleteness and file fetch failure without zeroing prior data', async () => {
  const result = await collectUsage({ api: fixture({ partial: true, matches: ['person/app'], repositories: { 'person/app': installed }, failing: ['/contents/'] }),
    previous: { repos: ['person/app'] }, seeds: [], now });
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.repos, ['person/app']);
  assert.ok(result.warnings.some(warning => warning.includes('Incomplete')));
});

test('paginates discovery results beyond first 100', async () => {
  const base = fixture({ repositories: { 'person/app': installed } });
  const pages = [];
  const api = async url => {
    if (!url.startsWith('/search/')) return base(url);
    const page = Number(new URL(url, 'https://example.com').searchParams.get('page'));
    pages.push(page);
    return { items: page === 1 ? Array.from({ length: 100 }, () => ({ full_name: 'person/claim' })) : [{ full_name: 'person/app' }], total_count: 101 };
  };
  const result = await collectUsage({ api, seeds: [], now });
  assert.ok(pages.includes(2));
  assert.deepEqual(result.repos, ['person/app']);
});

test('registration preserves existing topics and repeated registration is idempotent', async () => {
  let topics = ['personal']; let writes = 0;
  const request = async (url, options) => {
    if (!url.endsWith('/topics')) return { private: false };
    if (options) { topics = JSON.parse(options.body).names; writes++; }
    return { names: topics };
  };
  await registerPublicTopic({ repository: 'person/app', request });
  await registerPublicTopic({ repository: 'person/app', request });
  assert.deepEqual(topics, ['personal', TOPIC]);
  assert.equal(writes, 1);
});

test('never registers private repositories and surfaces denied topic registration', async () => {
  const calls = [];
  assert.equal(await registerPublicTopic({ repository: 'person/private', request: async url => { calls.push(url); return { private: true }; } }), 'private');
  assert.equal(calls.length, 1);
  await assert.rejects(registerPublicTopic({ repository: 'person/app', request: async (url, options) => {
    if (options) throw new Error('403');
    return url.endsWith('/topics') ? { names: [] } : { private: false };
  } }), /403/);
});

test('parses GitHub remotes and preserves installation date across reinstalls', () => {
  assert.equal(repositoryFromRemote('git@github.com:Person/App.git'), 'person/app');
  assert.equal(repositoryFromRemote('https://github.com/Person/App.git'), 'person/app');
  assert.equal(repositoryFromRemote('ssh://git@github.com/Person/App.git'), 'person/app');
  assert.equal(repositoryFromRemote('https://evil.example/Person/App'), null);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ghs-install-'));
  try {
    writeInstallation(root, 'person/app');
    const file = path.join(root, '.github/github-stats-charts.json');
    const before = fs.readFileSync(file, 'utf8');
    writeInstallation(root, 'person/app');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('stops network work on rate limiting and queues unverified candidates for next run', async () => {
  let calls = 0;
  const result = await collectUsage({ api: async () => { calls++; throw Object.assign(new Error('rate limit'), { status: 429 }); },
    previous: { repos: ['person/app'], stats: { stars: 2, forks: 3 } }, seeds: ['person/new'], now });
  assert.equal(calls, 1);
  assert.deepEqual(result.repos, ['person/app']);
  assert.deepEqual(result.pendingRepos, ['person/app', 'person/new']);
  assert.equal(result.status, 'partial');
  assert.equal(result.stats.stars, 2);
});

test('resumes previously pending discovery without counting it until verified', async () => {
  const result = await collectUsage({ api: fixture({ repositories: { 'person/app': installed } }),
    previous: { pendingRepos: ['person/app', 'person/false'] }, seeds: [], now });
  assert.deepEqual(result.repos, ['person/app']);
  assert.deepEqual(result.pendingRepos, []);
});
