// Eleventy only renders. All the logic lives in lib/ and all the data in data/.
import { HtmlBasePlugin } from '@11ty/eleventy';
import { formatQty } from './lib/units.js';
import { prettyDate } from './lib/dates.js';

export const SITE_URL = (process.env.SITE_URL || 'https://andorbal.github.io/dinner-prep').replace(/\/$/, '');
const pathPrefix = process.env.PATH_PREFIX ?? new URL(SITE_URL).pathname;

export default function (eleventy) {
  eleventy.addPlugin(HtmlBasePlugin);
  eleventy.addPassthroughCopy({ 'site/assets': 'assets' });
  // The grocery page runs the same list code in the browser.
  eleventy.addPassthroughCopy({ 'lib/grocery-core.js': 'assets/lib/grocery-core.js', 'lib/units.js': 'assets/lib/units.js' });
  eleventy.addPassthroughCopy({
    'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2': 'assets/fonts/archivo.woff2',
    'node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2': 'assets/fonts/dm-mono-400.woff2',
    'node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2': 'assets/fonts/dm-mono-500.woff2',
  });
  eleventy.addWatchTarget('data/');
  eleventy.addWatchTarget('lib/');

  eleventy.addFilter('json', (v) => JSON.stringify(v).replace(/</g, '\\u003c'));
  eleventy.addFilter('qty', formatQty);
  eleventy.addFilter('mins', (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m} min`));
  eleventy.addFilter('spiceWord', (n) => ['No heat', 'Mild', 'Medium', 'Hot'][n ?? 0]);
  eleventy.addFilter('byIds', (arr, ids) => arr.filter((x) => ids.includes(x.id)));
  eleventy.addFilter('find', (arr, key, val) => arr.find((x) => x[key] === val));
  eleventy.addFilter('slice2', (arr, a, b) => arr.slice(a, b));
  eleventy.addFilter('map', (arr, key) => (arr || []).map((x) => x[key]));
  eleventy.addFilter('prettyShort', (s) => prettyDate(s, { month: 'short', day: 'numeric' }));

  return {
    dir: { input: 'site', includes: '_includes', data: '_data', output: '_site' },
    pathPrefix,
    templateFormats: ['njk'],
    htmlTemplateEngine: 'njk',
  };
}
