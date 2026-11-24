# GitHub Stats Charts

[![used by](badges/used-by.svg)](.usage.json)
[![stars](badges/stars.svg)](https://github.com/hrmcngs/github-stats-charts/stargazers)
[![forks](badges/forks.svg)](https://github.com/hrmcngs/github-stats-charts/network/members)

`used by` は実際の導入コードを確認できた公開リポジトリ数の下限（`2+`＝少なくとも2件）です。登録方法と集計範囲は下の「利用登録」を参照してください。確認したリポジトリ・最終確認日時・取得状態は [集計データ](.usage.json) に記録します。

GitHub の活動を **Activity・使用言語・Contributions** のチャートで表示するウィジェット。
**HTML ページ**にも **Markdown（README 等）**にも埋め込めます。依存ライブラリなし・APIキー不要。

> 📋 このリポジトリは**テンプレート**です。右上の **「Use this template」** から自分用のリポジトリを作れます。

既存のリポジトリには、ルートで次のコマンドを実行して導入・更新できます（Node.js 20以降が必要）。旧URLも同じ導入処理につながります。

```sh
curl -fsSL https://raw.githubusercontent.com/hrmcngs/hrmcngs/main/bootstrap.sh | bash
```

導入後に変更をコミット・プッシュすると、Actions が12時間ごとに本リポジトリの共通コードを取得してSVGを再生成します。既存の `CONFIG`（ユーザー名・色・チャート設定）は保持します。すでに旧コマンドで導入済みの場合も、一度だけ再実行して新しい更新処理を導入してください。GitHub の Workflow permissions は「Read and write」が必要です。

### 利用登録

インストーラーは `.github/github-stats-charts.json` に導入先と初回導入日時を記録します。GitHub CLI でログイン済み（`gh auth login`）、または導入先を管理できる `GH_TOKEN` がある場合は、公開リポジトリに `github-stats-charts-user` トピックも追加します。既存のトピックは保持します。登録情報はこの公開トピックと導入ファイルで、専用サーバーへの送信は行いません。

認証がない場合や権限が足りない場合、インストールは継続しますが登録未完了と表示します。導入ファイルをプッシュしたうえで、認証後に `node scripts/register-installation.js` を実行するか、リポジトリの About の設定で `github-stats-charts-user` トピックを追加してください。旧導入先も、上のインストールコマンドを再実行して移行できます。登録を省略する場合は `curl -fsSL https://raw.githubusercontent.com/hrmcngs/hrmcngs/main/bootstrap.sh | GHS_REGISTER=0 bash` を使えます。

集計は毎日、登録トピック・README検索・過去の確認済み一覧から候補を集め、導入コードの存在を検証してリポジトリ単位で重複を除きます。トピックだけ、Forkしただけ、紹介リンクだけでは加算しません。API障害時は前回確認値を保持して `partial` と記録し、削除・非公開化・導入コードの削除を確認できた場合は除外します。

把握できるのは公開され検証できた導入先です。非公開・未登録で検索にも出ない導入先、GitHub外だけのサイト、インストールコマンドの実行回数は含みません。検索反映にも遅延があるため総インストール数とは区別し、バッジには `+` を付けます。`status: ok` は集計処理が成功した意味で、世界中の利用を網羅した意味ではありません。

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
| `scripts/register-installation.js` | 公開導入先の利用登録 |
| `bootstrap.sh` | 新規導入・旧インストールの移行 |
| `.github/workflows/update-charts.yml` | SVG を定期生成・コミットする GitHub Action |
| `charts/` | 生成された SVG の出力先 |
