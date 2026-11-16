// Reads the raw data files. Nothing here knows about the website.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readYaml(file) {
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)}: ${e.message}`);
  }
}

function readOptional(file) {
  return fs.existsSync(file) ? readYaml(file) : {};
}

function withIds(obj) {
  for (const [id, v] of Object.entries(obj)) obj[id] = { id, ...v };
  return obj;
}

function readDir(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    const id = f.replace(/\.ya?ml$/, '');
    out[id] = { id, ...readYaml(path.join(dir, f)), _file: path.relative(ROOT, path.join(dir, f)) };
  }
  return out;
}

export function loadData(root = ROOT) {
  const d = (p) => path.join(root, 'data', p);
  const ingredients = readYaml(d('ingredients.yaml'));
  for (const [id, v] of Object.entries(ingredients)) ingredients[id] = { id, ...v };
  const plans = Object.values(readDir(d('plans'))).sort((a, b) => a.week_of.localeCompare(b.week_of));
  return {
    household: readYaml(d('household.yaml')),
    rules: readYaml(d('rules.yaml')),
    ingredients,
    equipment: withIds(readOptional(d('equipment.yaml'))),
    stock: readOptional(d('stock.yaml')),
    schedule: readOptional(d('schedule.yaml')),
    components: readDir(d('components')),
    recipes: readDir(d('recipes')),
    plans,
  };
}
