#!/usr/bin/env bash
set -euo pipefail

REPO_RAW='https://raw.githubusercontent.com/hrmcngs/github-stats-charts/main'
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo 'Git リポジトリ内で実行してください。' >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"
command -v node >/dev/null 2>&1 || { echo 'Node.js 20 以降が必要です。' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || { echo 'Node.js 20 以降が必要です。' >&2; exit 1; }
GHS_USER="${GHS_USER:-$(git config --get remote.origin.url | sed -nE 's#.*github\.com[:/]([^/]+)/.*#\1#p')}"
[[ "$GHS_USER" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || { echo 'GHS_USER に GitHub ユーザー名を指定してください。' >&2; exit 1; }
export GHS_USER

setup_tmp="$(mktemp -d)"
trap 'rm -rf "$setup_tmp"' EXIT
curl -fsSL "$REPO_RAW/scripts/sync-upstream.js" -o "$setup_tmp/sync-upstream.js"
curl -fsSL "$REPO_RAW/.github/workflows/update-charts.yml" -o "$setup_tmp/update-charts.yml"
mkdir -p scripts .github/workflows
cp "$setup_tmp/sync-upstream.js" scripts/sync-upstream.js
new_install=false
if [ ! -f scripts/gen-charts.js ]; then new_install=true; fi
node scripts/sync-upstream.js
if [ "$new_install" = true ]; then
  node <<'NODE'
const fs = require('node:fs');
const file = 'scripts/gen-charts.js';
const source = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, source.replace(/(user: ')[^']*(',)/, (_, a, b) => a + process.env.GHS_USER + b));
NODE
fi
cp "$setup_tmp/update-charts.yml" .github/workflows/update-charts.yml
node scripts/gen-charts.js
cat <<'TEXT'
セットアップ完了。既存の CONFIG は保持しました。
次の変更をコミット・プッシュしてください:
  git add scripts src/js .github/workflows/update-charts.yml charts
  git commit -m "Enable automatic chart code updates"
  git push
Actions の Workflow permissions を「Read and write」にしてください。
以降は12時間ごとに共通コードを更新し、SVGを再生成します。
TEXT
