import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { drawTaggedPdfPage, loadTaggedPdfImage, TAGGED_PDF_PAGE_SIZE } from '../src/pages/TaggedUsers/taggedPdfGrid.js';

test('grid report retains seven users across two pages and fits all cards on A4', () => {
  const records = Array.from({ length: 7 }, (_, index) => ({
    name: `Person ${index + 1}`, imageUrl: '',
    details: [['Department', 'Engineering'], ['Camera', 'Reception'], ['Status', 'Tagged']],
  }));
  const doc = new jsPDF('portrait');
  const rect = doc.roundedRect.bind(doc);
  let cards = 0;
  doc.roundedRect = (x, y, width, height, ...rest) => {
    assert.ok(x >= 0 && y >= 0);
    assert.ok(x + width <= doc.internal.pageSize.getWidth());
    assert.ok(y + height < 290);
    cards++;
    return rect(x, y, width, height, ...rest);
  };
  for (let start = 0; start < records.length; start += TAGGED_PDF_PAGE_SIZE) {
    if (start) doc.addPage();
    drawTaggedPdfPage(doc, records.slice(start, start + TAGGED_PDF_PAGE_SIZE), [], {
      pageNumber: start / TAGGED_PDF_PAGE_SIZE + 1, totalPages: 2, generatedAt: '30/10/2026 17:00',
    });
  }
  assert.equal(doc.getNumberOfPages(), 2);
  assert.equal(cards, 7);
  const pdf = doc.output();
  for (const record of records) assert.ok(pdf.includes(record.name));
  assert.ok(pdf.includes('Page 2 of 2'));
  assert.ok(pdf.includes('Photo unavailable'));
});

test('invalid photo data does not prevent a user card from being exported', () => {
  const doc = new jsPDF('portrait');
  drawTaggedPdfPage(doc, [{ name: 'Alice', details: [['Status', 'Tagged']] }], ['invalid image'], {
    pageNumber: 1, totalPages: 1, generatedAt: '',
  });
  assert.ok(doc.output().includes('Alice'));
  assert.ok(doc.output().includes('Photo unavailable'));
});

test('missing image URL skips downloading', async () => {
  assert.equal(await loadTaggedPdfImage(''), null);
});
