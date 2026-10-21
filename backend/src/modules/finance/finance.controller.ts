import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { stringify } from "csv-stringify";
import { logger } from "../../lib/logger";
import { approvedClaimBatches, EXPORT_HEADER, exportRows, toDay } from "./finance.service";
import type { ExportQuery } from "./finance.schemas";

// A download, never rendered in the browser
function setDownloadHeaders(res: Response, period: { from: string; to: string }) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="approved-claims_${period.from}_${period.to}.csv"`);
  res.setHeader("Cache-Control", "private, no-store");
}

// GET /finance/export?from=&to=: approved claims of the period as a CSV download.
// Concept: streaming with backpressure. Database batches -> rows -> CSV text -> response, through pipeline(),
// so memory stays the size of one batch whatever the period, and a slow or departed client stops the reading.
export async function exportClaims(req: Request, res: Response) {
  const user = req.user!;
  const query = req.query as unknown as ExportQuery; // already validated and converted to dates by validate()
  const startedAt = Date.now();
  const period = { from: toDay(query.from), to: toDay(query.to) };

  // Express also routes HEAD here, and HEAD has no body: answer with the headers only, without any database work
  if (req.method === "HEAD") {
    setDownloadHeaders(res, period);
    res.end();
    return;
  }

  // Read the first batch BEFORE sending anything: if the database fails here, the client still gets a normal error response
  const batches = approvedClaimBatches(query.from, query.to);
  const first = await batches.next();

  setDownloadHeaders(res, period);

  // The CSV encoder: header row, a BOM so Excel reads UTF-8, CRLF line ends, and cells that start like a formula
  // (= + - @) get a leading quote so a spreadsheet shows them as text. Concept: CSV / formula injection.
  const csv = stringify({ header: true, columns: EXPORT_HEADER, bom: true, record_delimiter: "windows", escape_formulas: true });

  let rowCount = 0;
  const rows = Readable.from(exportRows(first, batches)).on("data", () => (rowCount += 1));

  try {
    await pipeline(rows, csv, res);
    logger.info({ userId: user.id, ...period, rowCount, durationMs: Date.now() - startedAt }, "Finance export finished");
  } catch (error) {
    // pipeline has already stopped the reading and closed the connection. If the status line is sent it cannot become a
    // 500, but the cut connection makes the client see a FAILED download, not a file that looks complete but is short.
    const clientLeft = (error as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE";
    logger[clientLeft ? "warn" : "error"](
      { err: clientLeft ? undefined : error, userId: user.id, ...period, rowCount },
      clientLeft ? "Finance export abandoned by the client" : "Finance export failed while streaming",
    );
  }
}
