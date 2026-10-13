import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import Location from "../../../core/v2/locations/location.model.js";
import Department from "../../../core/v2/departments/departments.model.js";
import Shift from "../../../core/v2/shifts/shifts.model.js";
import { formatFor, importConfiguration, importKind, templatePdf, templateRequestKind, templateRequestKinds, templateWorkbook } from "../../../core/v2/assistant/assistantConfigImport.service.js";

describe("assistant configuration import format", () => {
  it("identifies the requested resource from the chat instruction", () => {
    expect(importKind("Create locations from this Excel")).toBe("location");
    expect(importKind("add department using attached file")).toBe("department");
    expect(importKind("create shift management records")).toBe("shift");
  });

  it("uses the uploaded filename when the chat instruction has a typo", () => {
    expect(importKind("add this into depamrtnet", "departments.pdf")).toBe("department");
    expect(importKind("add these", "locations.xlsx")).toBe("location");
    expect(importKind("import these", "shifts.xls")).toBe("shift");
  });

  it("does not create records when the user is only asking which import type the file contains", () => {
    expect(importKind("Tell me whether this file creates locations, departments, or shifts.", "departments.pdf")).toBeNull();
  });

  it("provides a visible template with the required location columns", () => {
    const template = formatFor("location");
    expect(template.type).toBe("config_import_format");
    expect(template.columns).toEqual(["Location Name", "Employee Location ID"]);
    expect(template.example).toEqual(["Bangalore", "BLR001"]);
  });

  it("provides all seven working-day columns for shifts", () => {
    const template = formatFor("shift");
    expect(template.columns).toContain("Sunday");
    expect(template.columns).toContain("Saturday");
    expect(template.columns).toContain("Start Time");
  });

  it.each([
    ["give me bulk upload template for location", "location"],
    ["send department import template", "department"],
    ["where can I download the shifts template?", "shift"],
    ["location bulk upload structure", "location"],
    ["what is the department import format?", "department"],
    ["shift spreadsheet strcure", "shift"],
    ["which columns are in the location sheet?", "location"],
    ["show shift headers", "shift"],
    ["department sample file please", "department"],
    ["what should the location sheet look like?", "location"],
    ["location template", "location"],
    ["give me bulk upload templetes for depamrtnet", "department"],
  ])("recognizes the template request %s", (message, kind) => {
    expect(templateRequestKind(message)).toBe(kind);
  });

  it("does not route an import instruction or ambiguous request as a template", () => {
    expect(templateRequestKinds("Skip all optional fields")).toEqual([]);
    expect(templateRequestKinds("skip description fields")).toEqual([]);
    expect(templateRequestKind("upload these locations")).toBeNull();
    expect(templateRequestKind("show templates for locations and shifts")).toBeNull();
    expect(templateRequestKinds("show templates for locations and shifts")).toEqual(["location", "shift"]);
    expect(templateRequestKinds("give me bulk upload templates")).toEqual(["location", "department", "shift"]);
    expect(templateRequestKinds("upload these locations using the template")).toEqual([]);
    expect(templateRequestKinds("create shifts from this format")).toEqual([]);
    expect(templateRequestKinds("how many locations were created today?")).toEqual([]);
  });

  it.each(["location", "department", "shift"])("generates an importable %s workbook", async (kind) => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await templateWorkbook(kind));
    const sheet = book.worksheets[0];
    const format = formatFor(kind);
    expect(sheet.getRow(1).values.slice(1)).toEqual(format.columns);
    expect(sheet.getRow(2).values.slice(1)).toEqual(format.example);
  });

  it.each([["location", Location], ["department", Department], ["shift", Shift]])("generates a readable, importable %s PDF", async (kind, model) => {
    const exists = vi.spyOn(model, "exists").mockResolvedValue(false);
    const create = vi.spyOn(model, "create").mockResolvedValue({});
    const updateMany = kind === "shift" ? vi.spyOn(Shift, "updateMany").mockResolvedValue({}) : null;
    try {
      const buffer = await templatePdf(kind);
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
      const result = await importConfiguration({ file: { originalname: `${kind}.pdf`, buffer }, message: `import ${kind}`, verified: { userData: { adminId: "test-admin", orgId: "test-org" } } });
      expect(result, result.text).toMatchObject({ ok: true, ui: { type: "config_import_success", resource: kind, created: 1 } });
      expect(exists).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledOnce();
    } finally {
      exists.mockRestore();
      create.mockRestore();
      updateMany?.mockRestore();
    }
  });
});
