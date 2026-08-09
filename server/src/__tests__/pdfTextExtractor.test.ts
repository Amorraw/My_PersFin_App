import { reconstructLayout, PositionedItem } from "../utils/pdfTextExtractor";
import { parseStatement } from "../utils/pdfStatementParser";

// Builds a row of positioned text fragments left-to-right, mimicking PDFs (such as
// TD Canada Trust statements) that render words/numbers as runs of small glyph
// clusters with near-uniform kerning gaps between every fragment.
function buildRow(
  parts: Array<{ text: string; gapAfter?: number }>,
  y: number,
  charW = 4,
  height = 8
): PositionedItem[] {
  const items: PositionedItem[] = [];
  let x = 0;
  for (const part of parts) {
    items.push({ str: part.text, x, y, width: part.text.length * charW, height });
    x += part.text.length * charW + (part.gapAfter ?? charW);
  }
  return items;
}

describe("reconstructLayout", () => {
  it("joins glyph-cluster fragments of the same word without inserting spaces", () => {
    // "SHELBOURNE PLAZA" rendered as fine-grained glyph runs, as seen in real
    // TD Canada Trust PDF extractions ("SHE LBO URN E PL AZA").
    const items = buildRow(
      [
        { text: "SHE" },
        { text: "LBO" },
        { text: "URN" },
        { text: "E", gapAfter: 12 }, // genuine word boundary — bigger gap
        { text: "PL" },
        { text: "AZA" },
      ],
      100
    );

    expect(reconstructLayout(items)).toBe("SHELBOURNE   PLAZA");
  });

  it("reconstructs a glued month+day date split across multiple fragments", () => {
    // "MAR04" rendered as "M A R0 4"
    const items = buildRow([{ text: "M" }, { text: "A" }, { text: "R0" }, { text: "4" }], 100);
    expect(reconstructLayout(items)).toBe("MAR04");
  });

  it("reconstructs a decimal amount split across multiple fragments", () => {
    // "290.00" rendered as "29 0 .0 0"
    const items = buildRow(
      [{ text: "29" }, { text: "0" }, { text: "." }, { text: "0" }, { text: "0" }],
      100
    );
    expect(reconstructLayout(items)).toBe("290.00");
  });

  it("still inserts whitespace for genuinely large column gaps", () => {
    const items = buildRow(
      [{ text: "Description", gapAfter: 40 }, { text: "Balance" }],
      100
    );
    const result = reconstructLayout(items);
    expect(result.startsWith("Description")).toBe(true);
    expect(result.endsWith("Balance")).toBe(true);
    expect(result).toMatch(/Description\s+Balance/);
  });
});

describe("parseStatement against real fragmented TD extraction", () => {
  // Verbatim excerpt of the raw text reported from a real TD Canada Trust
  // chequing PDF, where pdfjs renders every word/number as single-space
  // separated glyph clusters (e.g. "Descri pt i on", "M A R0 4").
  const rawText = `Descri pt i on Wi t hd rawal s Dep osi t s Da te Bal anc e
S TA RT I N G B AL AN C E F E B2 7 2 7. 7 1 OD
E -T R AN SF E R * * *a H N 29 0 .0 0 M A R0 4
S HA W C AB L ES YS T E _ V 2 61 . 0 0 M A R0 4 1. 2 9
4 , 6 29 . 1 6 4 , 86 4 .3 1
Acc ou nt /T ran sact i on T ype F ees Reb at e Bala nce Wai ved Fe es P ai d Fe es`;

  it("recovers the TD column header and parses transaction rows", () => {
    const result = parseStatement(rawText);

    expect(result.transactions).toHaveLength(2);

    const [etransfer, shaw] = result.transactions;
    expect(etransfer.descriptionRaw).toBe("E-TRANSFER***aHN");
    expect(etransfer.amount).toBe(290);
    expect(etransfer.type).toBe("income");
    expect(etransfer.postedDate.endsWith("-03-04")).toBe(true);

    expect(shaw.descriptionRaw).toBe("SHAWCABLESYSTE");
    expect(shaw.amount).toBe(261);
    expect(shaw.postedDate.endsWith("-03-04")).toBe(true);
  });

  it("warns when a TFR-TO/TFR-FR row's reference number abuts the amount", () => {
    const textWithTransfer = `${rawText}
J L3 0 2 T F R- T O 7 15 2 30 9 8 . 8 5 M A R1 3`;

    const result = parseStatement(textWithTransfer);

    const transfer = result.transactions.find(t => /TFR-TO/i.test(t.descriptionRaw));
    expect(transfer).toBeDefined();

    expect(result.warnings.some(w => /TFR-TO\/TFR-FR/.test(w))).toBe(true);
  });
});

describe("parseStatement against reconstructed TD-style layout", () => {
  it("detects the TD concatenated format and parses a transaction row", () => {
    const headerRow = buildRow(
      [
        { text: "Descri" },
        { text: "ption", gapAfter: 12 },
        { text: "Withdr" },
        { text: "awals", gapAfter: 12 },
        { text: "Depo" },
        { text: "sits", gapAfter: 12 },
        { text: "Da" },
        { text: "te", gapAfter: 12 },
        { text: "Bal" },
        { text: "ance" },
      ],
      100
    );

    const txnRow = buildRow(
      [
        { text: "E-TR" },
        { text: "ANSF" },
        { text: "ER**" },
        { text: "*aHN", gapAfter: 12 },
        { text: "29" },
        { text: "0" },
        { text: "." },
        { text: "0" },
        { text: "0", gapAfter: 12 },
        { text: "M" },
        { text: "A" },
        { text: "R0" },
        { text: "4", gapAfter: 12 },
        { text: "27" },
        { text: "69" },
        { text: "." },
        { text: "16" },
      ],
      90
    );

    const text = reconstructLayout([...headerRow, ...txnRow]);

    expect(text).toMatch(/Description\s*Withdrawals\s*Deposits\s*Date\s*Balance/i);

    const result = parseStatement(text);
    expect(result.transactions).toHaveLength(1);

    const txn = result.transactions[0];
    expect(txn.amount).toBe(290);
    expect(txn.type).toBe("income");
    expect(txn.postedDate).toBe(`${new Date().getFullYear()}-03-04`);
    expect(txn.descriptionRaw).toBe("E-TRANSFER***aHN");
  });
});
