/* FILE GUIDE:
 * server/src/utils/pdfTable.js
 * Purpose: Minimal table rendering for pdfkit exports (analytics + assignment results).
 * pdfkit has no built-in table widget - this hand-draws header/rows with
 * borders, zebra striping, and automatic page breaks so the various export
 * PDFs read as an actual record instead of unstructured lines of text.
 */

// A compact two-column "Label: Value" block, used for the summary section
// at the top of an export before any of the real tables.
export function drawInfoBlock(doc, { x, y, rows, labelWidth = 110, rowHeight = 16, fontSize = 9.5 }) {
  let cursorY = y;
  rows.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#0f172a").text(String(label), x, cursorY, { width: labelWidth });
    doc.font("Helvetica").fontSize(fontSize).fillColor("#334155").text(value == null || value === "" ? "—" : String(value), x + labelWidth, cursorY, { width: 420 - labelWidth });
    cursorY = Math.max(cursorY + rowHeight, doc.y + 4);
  });
  return cursorY + 6;
}

// columns: [{ label, width, align? }]. rows: array of arrays of cell values (same order as columns).
export function drawTable(doc, { x, y, columns, rows, rowHeight = 20, fontSize = 8.5, title }) {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  let cursorY = y;

  if (title) {
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(title, x, cursorY);
    cursorY = doc.y + 6;
  }

  function drawHeaderRow() {
    doc.rect(x, cursorY, totalWidth, rowHeight).fill("#2b6cff");
    let cellX = x;
    doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#ffffff");
    columns.forEach((col) => {
      doc.text(col.label, cellX + 5, cursorY + (rowHeight - fontSize) / 2 - 1, { width: col.width - 10, align: col.align || "left" });
      cellX += col.width;
    });
    cursorY += rowHeight;
  }

  drawHeaderRow();

  if (!rows.length) {
    doc.rect(x, cursorY, totalWidth, rowHeight).fillAndStroke("#f8fafc", "#dbe3f0");
    doc.font("Helvetica-Oblique").fontSize(fontSize).fillColor("#94a3b8").text("No data yet.", x + 5, cursorY + (rowHeight - fontSize) / 2 - 1, { width: totalWidth - 10 });
    return cursorY + rowHeight + 14;
  }

  rows.forEach((row, rowIndex) => {
    // Measure the tallest cell in this row (prompts/names can wrap) before committing to a height.
    doc.font("Helvetica").fontSize(fontSize);
    const cellHeight = Math.max(rowHeight, ...row.map((cell, i) => doc.heightOfString(String(cell ?? "—"), { width: columns[i].width - 10 }) + 8));

    if (cursorY + cellHeight > pageBottom) {
      doc.addPage();
      cursorY = doc.page.margins.top;
      drawHeaderRow();
    }

    doc.rect(x, cursorY, totalWidth, cellHeight).fillAndStroke(rowIndex % 2 === 1 ? "#f4f7fd" : "#ffffff", "#dbe3f0");
    let cellX = x;
    doc.font("Helvetica").fontSize(fontSize).fillColor("#1e293b");
    row.forEach((cell, i) => {
      doc.text(cell == null || cell === "" ? "—" : String(cell), cellX + 5, cursorY + 4, { width: columns[i].width - 10, align: columns[i].align || "left" });
      cellX += columns[i].width;
    });
    cursorY += cellHeight;
  });

  return cursorY + 14;
}
