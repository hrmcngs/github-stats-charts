'use strict';

const fs = require('node:fs');
const path = require('node:path');
const escape = (value) => String(value).replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));

function badge(label, value, color) {
  const text = String(value);
  const left = label.length * 7 + 12;
  const right = Math.max(24, text.length * 7 + 12);
  const width = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escape(label)}: ${escape(text)}">`
    + `<title>${escape(label)}: ${escape(text)}</title>`
    + `<rect width="${width}" height="20" rx="3" fill="#555"/>`
    + `<path d="M${left} 0h${right - 3}q3 0 3 3v14q0 3-3 3H${left}z" fill="${color}"/>`
    + `<g fill="#fff" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="11">`
    + `<text x="${left / 2}" y="14">${escape(label)}</text>`
    + `<text x="${left + right / 2}" y="14">${escape(text)}</text></g></svg>\n`;
}

function writeBadges(directory, { usage, stars, forks }) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [file, label, value, color] of [
    ['used-by', 'used by', usage, '#007ec6'],
    ['stars', 'stars', stars, '#9f7500'],
    ['forks', 'forks', forks, '#007ec6'],
  ]) {
    fs.writeFileSync(path.join(directory, `${file}.svg`), badge(label, value, color));
  }
}

module.exports = { badge, writeBadges };
