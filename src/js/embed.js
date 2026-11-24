// powered by https://github.com/hrmcngs/github-stats-charts
// このファイルを1つ読み込むと、同じ配信元の描画ライブラリとウィジェットを順に読み込む。
(() => {
  'use strict';

  const source = document.currentScript;
  if (!source || window.GHSChartsEmbedLoading) return;
  window.GHSChartsEmbedLoading = true;
  const base = new URL('.', source.src);

  function load(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(file, base).href;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${script.src}`));
      document.head.appendChild(script);
    });
  }

  load('charts.js')
    .then(() => load('github-stats.js'))
    .catch((error) => {
      window.GHSChartsEmbedLoading = false;
      console.error('[github-stats]', error.message);
    });
})();
