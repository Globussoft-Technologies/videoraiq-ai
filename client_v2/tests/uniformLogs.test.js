import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UNIFORM_CONFIG } from '../src/pages/IncidentLogs/configs.js';

// Render the real column/card functions, stubbing only unrelated page widgets.
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/pages/IncidentLogs/incidentColumns.jsx', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic' });
const Image = props => React.createElement('img', { src: props.src, alt: props.alt });
const mocks = {
  '@/utils/timezone': { getConfiguredTimezone: () => 'Asia/Kolkata' },
  './incidentState': { styles: { text: '' } },
  './stockMovement': {}, './boxPacking': {},
  '@/pages/AttendanceLogs/components/ImageWithLoader': Image,
  '@/page/user/Incidents/IncidentHygieneDetails': () => null,
  '@/utils/mobileEmbed': { isMobileEmbedded: () => false },
};
const module = { exports: {} };
runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] || require(name) });
const { buildColumns, renderIncidentCard } = module.exports;
const row = {
  incidentName: 'Uniform Detection', incidentImageUrl: 'https://images.test/uniform.jpg',
  nvrName: 'Warehouse NVR', channelName: 'Main Gate', severity: 'moderate', createdAt: '2026-10-29T09:35:10Z',
};

test('Uniform list shows the snapshot, NVR, camera, severity and incident time', () => {
  const columns = buildColumns(UNIFORM_CONFIG, { onSort() {}, onPreview() {} });
  assert.deepEqual(Array.from(columns, column => column.accessorKey || column.id), [
    'snap', 'nvrName', 'channelName', 'severity', 'createdAt',
  ]);
  const markup = columns.map(column => renderToStaticMarkup(React.createElement(column.cell, { row: { original: row } }))).join('');
  for (const value of ['Warehouse NVR', 'Main Gate', 'moderate', '29/10/2026 03:05 PM', row.incidentImageUrl]) assert.ok(markup.includes(value), value);
  const preview = columns[0].cell({ row: { original: row } });
  assert.equal(preview.props.title, 'View image');
});

test('Uniform grid shows the same fields and opens the clicked snapshot', () => {
  const previews = [];
  const card = renderIncidentCard(row, UNIFORM_CONFIG, { onPreview: image => previews.push(image) });
  const markup = renderToStaticMarkup(card);
  for (const value of ['Warehouse NVR', 'Main Gate', 'moderate', 'Time of Incident', '29/10/2026 03:05 PM', row.incidentImageUrl]) assert.ok(markup.includes(value), value);
  const visit = element => {
    if (!React.isValidElement(element)) return;
    if (element.type === Image) element.props.onClick();
    React.Children.forEach(element.props.children, visit);
  };
  visit(card);
  assert.deepEqual(previews, [row.incidentImageUrl]);
});
