import { promises as fs } from "node:fs";
import type { PdfPageText } from "./text";

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

export async function extractPdfPages(filePath: string): Promise<PdfPageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const buffer = await fs.readFile(filePath);
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false
  }).promise;
  const pages: PdfPageText[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; text: string }>>();

    for (const item of content.items as PdfTextItem[]) {
      const text = item.str?.trim();
      const x = item.transform?.[4];
      const y = item.transform?.[5];

      if (!text || typeof x !== "number" || typeof y !== "number") {
        continue;
      }

      const key = Math.round(y);
      const row = rows.get(key) ?? [];
      row.push({ x, text });
      rows.set(key, row);
    }

    pages.push({
      pageNumber,
      text: Array.from(rows.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) =>
          parts
            .sort((a, b) => a.x - b.x)
            .map((part) => part.text)
            .join(" ")
        )
        .join("\n")
    });
  }

  return pages;
}
