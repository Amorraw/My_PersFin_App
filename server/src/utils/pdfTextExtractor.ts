import path from "path";

// pdfjs-dist ships ESM-only — load it dynamically so it works from this CommonJS build.
// The "legacy" build is the Node-compatible entry point (no DOM/canvas requirements).
// A plain `import()` here would be downleveled by tsc (module: commonjs) into a
// `require()` call, which fails on Node < 22.12 with ERR_REQUIRE_ESM. Wrapping it in
// `new Function` hides it from tsc's transform, preserving the native dynamic import.
const dynamicImport: (specifier: string) => Promise<any> = new Function(
  "specifier",
  "return import(specifier)"
) as any;

let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = dynamicImport("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsPromise;
}

// Bundled font/cmap data — needed for accurate glyph→text mapping on PDFs that
// reference standard (non-embedded) fonts, common in bank-generated statements.
const PDFJS_ROOT = path.dirname(require.resolve("pdfjs-dist/package.json"));
const STANDARD_FONT_DATA_URL = path.join(PDFJS_ROOT, "standard_fonts") + path.sep;
const CMAP_URL = path.join(PDFJS_ROOT, "cmaps") + path.sep;

export interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Groups text items into visual rows (by y-position) and columns (by x-position),
// reconstructing whitespace so columns that were rendered far apart on the page
// stay visually separated in the extracted text — exactly what the line-based
// statement parsers (date-anchored blocks, amount columns) expect.
export function reconstructLayout(items: PositionedItem[]): string {
  if (items.length === 0) return "";

  const Y_TOLERANCE = 2;
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PositionedItem[][] = [];
  for (const item of sorted) {
    const line = lines.find(l => Math.abs(l[0].y - item.y) <= Y_TOLERANCE);
    if (line) line.push(item);
    else lines.push([item]);
  }
  lines.sort((a, b) => b[0].y - a[0].y);

  const out: string[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);

    let text = "";
    let prevEnd: number | null = null;
    let prevItem: PositionedItem | null = null;
    for (const item of line) {
      if (prevEnd !== null && prevItem) {
        const gap = item.x - prevEnd;
        // Estimate the natural glyph advance width from the actual rendered
        // width of the surrounding items — more reliable than guessing from
        // font height, since some bank statement PDFs use condensed fonts
        // where glyphs are much narrower than the line height.
        const widths = [prevItem, item]
          .filter(it => it.str.trim().length > 0)
          .map(it => it.width / it.str.length)
          .filter(w => w > 0);
        const charWidth = widths.length > 0
          ? widths.reduce((a, b) => a + b, 0) / widths.length
          : (item.height || 10) * 0.5;

        // Several bank statement PDFs render every word/number as a run of
        // small glyph-clusters separated by ordinary kerning gaps roughly
        // one character wide. Only gaps clearly larger than a single
        // character are treated as real word/column boundaries — anything
        // smaller is joined with no space, avoiding "SHE LBO URN E" style
        // fragmentation of words and "2 7. 7 1" fragmentation of numbers.
        if (gap > charWidth * 1.8) {
          const spaces = Math.min(20, Math.max(1, Math.round(gap / charWidth)));
          text += " ".repeat(spaces);
        }
      }
      text += item.str;
      prevEnd = item.x + item.width;
      prevItem = item;
    }
    out.push(text.replace(/\s+$/, ""));
  }

  return out.join("\n");
}

// Extracts text from a PDF buffer with table layout preserved as whitespace,
// using pdf.js for position-aware text extraction (vs. pdf-parse's flat stream order).
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfjs();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    isEvalSupported: false,
    verbosity: 0,
  });

  const doc = await loadingTask.promise;
  try {
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      try {
        const content = await page.getTextContent();
        const items: PositionedItem[] = content.items
          .filter((it: any) => typeof it.str === "string" && it.str.length > 0)
          .map((it: any) => ({
            str: it.str,
            x: it.transform[4],
            y: it.transform[5],
            width: it.width,
            height: it.height || Math.abs(it.transform[3]) || 10,
          }));
        pageTexts.push(reconstructLayout(items));
      } finally {
        page.cleanup();
      }
    }
    return pageTexts.join("\n\n");
  } finally {
    await doc.destroy();
  }
}
