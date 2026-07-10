/**
 * Unit test for the tiny `parseXml` wrapper around xml2js. The util is used
 * by ChannelsService.getPlaybackTimeline; we just confirm the wrapper turns
 * XML strings into a plain JS object and propagates parser errors.
 */
import { describe, it, expect } from "vitest";
import { parseXml } from "../../../utils/xmlParse.js";

describe("parseXml", () => {
  it("parses a well-formed XML string into a JS object", async () => {
    const xml = `<?xml version="1.0"?>
      <CMSearchResult>
        <searchID>abc-123</searchID>
        <numOfMatches>2</numOfMatches>
      </CMSearchResult>`;
    const result = await parseXml(xml);
    expect(result.CMSearchResult).toBeDefined();
    expect(result.CMSearchResult.searchID).toBe("abc-123");
    expect(result.CMSearchResult.numOfMatches).toBe("2");
  });

  it("rejects on malformed XML", async () => {
    await expect(parseXml("<broken>oh no")).rejects.toBeTruthy();
  });
});
