import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialState, reducer } from '../src/pages/IncidentLogs/incidentState.js';
import { GENDER_AGE_CONFIG } from '../src/pages/IncidentLogs/configs.js';

const require = createRequire(import.meta.url);
async function load(path, mocks = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic', define: {
    'import.meta.env.VITE_BACKEND': JSON.stringify('https://backend.test/api/v2'),
    'import.meta.env.VITE_INCIDENT_URL': JSON.stringify('https://images.test/'),
  } });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] || require(name) });
  return module.exports;
}
const GenderFilter = (await load('../src/pages/IncidentLogs/components/GenderFilter.jsx')).default;

test('All, Male and Female buttons show matching icons and clear the selection', () => {
  const changes = [];
  const control = GenderFilter({ value: 'Male', onChange: value => changes.push(value) });
  const buttons = React.Children.toArray(control.props.children);
  assert.equal(buttons.length, 3);
  assert.equal(buttons[1].props['aria-pressed'], true);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(changes, ['', 'Male', 'Female']);
  const html = renderToStaticMarkup(React.createElement(GenderFilter, { value: 'Female', onChange() {} }));
  for (const label of ['All', 'Male', 'Female', 'lucide-users', 'lucide-mars', 'lucide-venus']) assert.ok(html.includes(label), label);
});

test('changing the gender resets pagination and resetting filters clears gender', () => {
  const state = reducer({ ...initialState, currentPage: 6 }, { type: 'SET_GENDER', value: 'Female' });
  assert.equal(state.gender, 'Female');
  assert.equal(state.currentPage, 1);
  assert.equal(reducer(state, { type: 'RESET_FILTERS' }).gender, '');
});

test('the API sends the selected gender and omits it for All', async () => {
  const calls = [];
  const api = await load('../src/pages/IncidentLogs/Api/index.jsx', {
    axios: { request: async config => { calls.push(config); return {}; } },
    '@/utils/getAccessToken': () => 'test-token', '../doorIncident': {},
  });
  for (const gender of ['Male', 'Female', '']) await api.fetchIncidentLogs({ endpoint: GENDER_AGE_CONFIG.endpoint, gender, skip: 0, limit: 20 });
  assert.equal(calls[0].params.gender, 'Male');
  assert.equal(calls[1].params.gender, 'Female');
  assert.ok(!Object.hasOwn(calls[2].params, 'gender'));
});

test('Excel and both PDF views request the selected gender for export', async () => {
  const calls = [];
  const exports = await load('../src/pages/IncidentLogs/incidentExport.js', {
    '@/helpers/lightingDetection': {}, '@/helpers/hygieneDetection': {},
    '@/utils/timezone': {}, 'xlsx-js-style': {}, jspdf: {}, 'jspdf-autotable': {},
    sonner: { toast: { error() {} } },
    './Api': { fetchIncidentLogs: async query => { calls.push(query); return { data: { body: { data: { data: [] } } } }; } },
    './incidentColumns': {}, './doorIncident': {}, './stockMovement': {}, './boxPacking': {}, './pdfReportTemplate': {},
  });
  for (const format of ['excel', 'pdf', 'pdf-grid']) await exports.handleIncidentExport(format, GENDER_AGE_CONFIG, { gender: 'Female' });
  assert.equal(calls.length, 3);
  for (const query of calls) {
    assert.equal(query.gender, 'Female');
    assert.equal(query.limit, 10000);
  }
});
