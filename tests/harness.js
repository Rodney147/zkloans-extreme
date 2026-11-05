'use strict';
/* Laadt de rekenkern (js/core/*.js) in een losse context, zonder browser, zodat de regels in Node te testen zijn. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CORE = ['config/config.js', 'js/core/format.js', 'js/core/tax.js', 'js/core/e1.js', 'js/core/import.js', 'js/core/state.js', 'js/core/rules.js', 'js/core/analyse.js', 'js/core/risk.js'];

function createCore() {
  const context = vm.createContext({ console, Intl, Math, Date, JSON, Number, String, Object, Array, Map, Set, RegExp, Promise, Error, Infinity, NaN, isFinite, parseFloat, parseInt, window: {} });
  CORE.filter(file => fs.existsSync(path.join(ROOT, file))).forEach(file => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file }));
  return context;
}
const run = (core, code) => vm.runInContext(code, core);

/* Een map met JSON-bestanden inladen zoals de uploadknop dat doet */
async function loadFixture(core, folder) {
  const dir = path.join(ROOT, 'tests', 'fixtures', folder);
  const files = fs.readdirSync(dir).filter(name => (name.endsWith('.json') || name.endsWith('.csv')) && name !== 'expected.json').sort().map(name => ({ name, text: async () => fs.readFileSync(path.join(dir, name), 'utf8') }));
  core.__files = files;
  const dossier = await run(core, 'readDataset(__files)');
  core.__dossier = dossier;
  run(core, 'DOSSIER = __dossier; resetDossierState();');
  return dossier;
}
function analyseView(core, view) {
  core.__view = view;
  return run(core, 'overlay = __view; A = analyse(); A');
}
module.exports = { createCore, run, loadFixture, analyseView, ROOT };
