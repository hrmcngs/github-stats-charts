# GitHub Stats Charts

[![used by](badges/used-by.svg)](https://github.com/hrmcngs/github-stats-charts/network/dependents)
[![stars](badges/stars.svg)](https://github.com/hrmcngs/github-stats-charts/stargazers)
[![forks](badges/forks.svg)](https://github.com/hrmcngs/github-stats-charts/network/members)

GitHub の活動を **Activity・使用言語・Contributions** のチャートで表示するウィジェット。
**HTML ページ**にも **Markdown（README 等）**にも埋め込めます。依存ライブラリなし・APIキー不要。

> 📋 このリポジトリは**テンプレート**です。右上の **「Use this template」** から自分用のリポジトリを作れます。

既存のリポジトリには、ルートで次のコマンドを実行して導入・更新できます（Node.js 20以降が必要）。旧URLも同じ導入処理につながります。

```sh
curl -fsSL https://raw.githubusercontent.com/hrmcngs/hrmcngs/main/bootstrap.sh | bash
```

導入後に変更をコミット・プッシュすると、Actions が12時間ごとに本リポジトリの共通コードを取得してSVGを再生成します。既存の `CONFIG`（ユーザー名・色・チャート設定）は保持します。すでに旧コマンドで導入済みの場合も、一度だけ再実行して新しい更新処理を導入してください。GitHub の Workflow permissions は「Read and write」が必要です。

---

## セットアップ（4ステップ）

1. **「Use this template」** → 自分のリポジトリを作成
2. [`scripts/gen-charts.js`](scripts/gen-charts.js) の `CONFIG.user` を**自分の GitHub ユーザー名**に変更
3. Settings → Actions → General → **Workflow permissions** を「Read and write」に
4. Actions タブ → **「Update chart SVGs」** を Run workflow（以後12時間ごとに自動）
   → `charts/` に SVG が生成されます

---

## HTML で使う

`<div>` とスクリプト1つを置くだけ（CSSは自動注入）:

```html
<div data-github-user="あなたのユーザー名"></div>
<script src="https://cdn.jsdelivr.net/gh/hrmcngs/github-stats-charts@main/src/js/embed.js" defer></script>
```

→ [`index.html`](index.html) が動く例です。

このURLは本リポジトリの `main` を参照するので、更新後はCDN・ブラウザのキャッシュ更新後、次回のページ表示で改善が反映されます。ファイルのコピーや利用先での再ビルドは不要です。既存のローカルスクリプト2つは、上のスクリプト1つに置き換えてください。開いたままのページは再読み込みしてください。

Activity のレーダーチャートは、各頂点にカーソルを合わせると項目名と数値を表示します。Tab キーで頂点にフォーカスしても確認できます。

### サイトのテーマ色に合わせる

ウィジェットの色はCSS変数で上書きできます。ライト/ダーク切り替えで
これらの変数を変更すると、チャートのSVGも再描画なしで追従します。

```css
.ghs {
  --ghs-bg: var(--page-bg);
  --ghs-border: var(--page-border);
  --ghs-text: var(--page-text);
  --ghs-muted: var(--page-muted);
  --ghs-accent: var(--page-accent);
}
```

`--ghs-bg`、`--ghs-border`、`--ghs-text`、`--ghs-muted`、
`--ghs-accent`にはGitHub Dark相当の既定色があります。

## Markdown / README で使う

GitHub Action が生成した SVG を画像として埋め込みます:

README の画像埋め込みでは頂点のホバー表示は利用できません。数値をホバーで確認するには、HTML のウィジェット、または SVG ファイルをブラウザで直接開いてください。

描画ライブラリ・生成スクリプトを `main` に更新すると SVG も自動で再生成します。新しい更新処理を導入した別リポジトリでは、12時間ごとのActions実行時に共通コードの更新も取り込みます（Actionsから手動実行も可能）。

```markdown
![activity](charts/activity.svg)
![languages](charts/languages.svg)
![contributions](charts/contributions.svg)
```

他リポジトリからは raw URL で:

```markdown
![](https://raw.githubusercontent.com/<owner>/<repo>/main/charts/activity.svg)
```

---

## チャートの種類

| セクション | 種類 |
|---|---|
| Activity | `radar` `pie` `bar` `hbar` `area` |
| 使用言語 | `hbar` `pie` `bar` `area` |
| Contributions | `default`（季節色）/ `grid` / `bars3d`（立体棒）|

- HTML … `<div>` の `data-*` 属性で種類・色を指定
- Markdown … `gen-charts.js` の `CONFIG` で指定

`default` の Contributions は GitHub と同様、ハロウィン＝かぼちゃ色 / クリスマス＝赤 に自動で変わります。

**設定の詳細・全 `data-*` 属性は [GITHUB-STATS.md](GITHUB-STATS.md) を参照。**

---

## 仕組み

- データ取得 … GitHub REST API ＋ jogruber API（どちらも認証不要・CORS対応）
- HTML … ブラウザがその場で取得（失敗時は `charts/data.json` にフォールバック）
- Markdown … GitHub Action（`GITHUB_TOKEN` 使用）が SVG を定期生成

## ファイル

| ファイル | 役割 |
|---|---|
| `src/js/embed.js` | 外部サイト用の共通読み込みスクリプト |
| `src/js/charts.js` | SVG チャート描画ライブラリ（HTML・Markdown 共用）|
| `src/js/github-stats.js` | HTML 用ライブウィジェット |
| `scripts/gen-charts.js` | Markdown 用 SVG 生成スクリプト |
| `scripts/sync-upstream.js` | 利用先の設定を保持して共通コードを自動更新 |
| `bootstrap.sh` | 新規導入・旧インストールの移行 |
| `.github/workflows/update-charts.yml` | SVG を定期生成・コミットする GitHub Action |
| `charts/` | 生成された SVG の出力先 |
