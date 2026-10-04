import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { settingsFromSeed } from '../lib/seed.ts';
import { defaultSettings } from '../lib/domain/index.ts';

const source = process.argv[2];
if (!source) throw new Error('Usage: node --experimental-strip-types scripts/prepare-seed.ts /absolute/path/to/health_plan_seed.json');
const seed = JSON.parse(await readFile(resolve(source), 'utf8'));
const settings = settingsFromSeed(seed, defaultSettings());
const directory = resolve('.private');
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
await writeFile(resolve(directory, 'seed-settings.json'), JSON.stringify({ settings, status: 'prepared_not_saved', actual_records_created: 0, description: 'Only whitelisted self-reported height/weight; confirm current settings before applying through authenticated Site tools.' }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ prepared: true, cloud_saved: false, actual_records_created: 0, path: '.private/seed-settings.json' }));
