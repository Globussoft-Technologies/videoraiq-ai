import xml2js from "xml2js";
export const parseXml = async (xml) =>
  await new xml2js.Parser({ explicitArray: false }).parseStringPromise(xml);
