import { buildModel } from '../../lib/model.js';
import { SITE_URL } from '../../eleventy.config.js';

export default function () {
  return buildModel({ baseUrl: SITE_URL, today: process.env.TODAY || undefined });
}
