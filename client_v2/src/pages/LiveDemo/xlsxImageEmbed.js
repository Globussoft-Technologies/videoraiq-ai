import { strFromU8, strToU8 } from 'fflate';

// xlsx-js-style writes cells and hyperlinks but does not add images. Attach a
// standard worksheet drawing to its ZIP output for the logo and event snapshots.
export function embedImagesInWorksheet(zip, sheetIndex, placements) {
  if (!placements.length) return;
  const sheetPath = `xl/worksheets/sheet${sheetIndex}.xml`;
  const relPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`;
  const drawingPath = `xl/drawings/drawing${sheetIndex}.xml`;
  const drawingRelPath = `xl/drawings/_rels/drawing${sheetIndex}.xml.rels`;
  let sheetXml = strFromU8(zip[sheetPath]);
  let sheetRels = zip[relPath] ? strFromU8(zip[relPath]) : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const ids = [...sheetRels.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const drawingId = `rId${Math.max(0, ...ids) + 1}`;
  sheetRels = sheetRels.replace('</Relationships>', `<Relationship Id="${drawingId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${sheetIndex}.xml"/></Relationships>`);
  if (!sheetXml.includes('xmlns:r=')) sheetXml = sheetXml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  sheetXml = sheetXml.replace('</worksheet>', `<drawing r:id="${drawingId}"/></worksheet>`);
  zip[sheetPath] = strToU8(sheetXml);
  zip[relPath] = strToU8(sheetRels);

  const anchors = placements.map(({ row, col, bytes, widthPx = 100, heightPx = 60 }, index) => {
    const mediaName = `live-demo-${sheetIndex}-${index + 1}.png`;
    zip[`xl/media/${mediaName}`] = bytes;
    return { row, col, mediaName, id: index + 1, widthPx, heightPx };
  });
  zip[drawingPath] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.map(({ row, col, id, widthPx, heightPx }) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${widthPx * 9525}" cy="${heightPx * 9525}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Live Demo image ${id}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join('')}</xdr:wsDr>`);
  zip[drawingRelPath] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${anchors.map(({ mediaName, id }) => `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`).join('')}</Relationships>`);
  let types = strFromU8(zip['[Content_Types].xml']);
  if (!types.includes('Extension="png"')) types = types.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  types = types.replace('</Types>', `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  zip['[Content_Types].xml'] = strToU8(types);
}
