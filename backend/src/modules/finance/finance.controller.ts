import type { Request, Response } from "express";
import { CSV_BOM, csvRow } from "../../lib/csv";
import { logger } from "../../lib/logger";
import { approvedClaimBatches, EXPORT_HEADER, toCsvFields, toDay } from "./finance.service";
import type { ExportQuery } from "./finance.schemas";

// Resolves when the socket can take more data, or when the client has gone away
function waitForDrain(res: Response): Promise<void> {
  return new Promise((resolve) => {
    res.once("drain", resolve);
    res.once("close", resolve);
  });
}

// GET /finance/export?from=&to=: approved claims of the period as a CSV download.
// Concept: streaming. Rows go out batch by batch, so memory stays the size of one batch whatever the period.
export async function exportClaims(req: Request, res: Response) {
  const user = req.user!;
  const query = req.query as unknown as ExportQuery; // already validated and converted to dates by validate()
  const startedAt = Date.now();

  // Read the first batch BEFORE sending anything: if the database fails here, the client still gets a normal error response
  const batches = approvedClaimBatches(query.from, query.to);
  const first = await batches.next();

  // A download, never rendered in the browser
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="approved-claims_${toDay(query.from)}_${toDay(query.to)}.csv"`);
  res.setHeader("Cache-Control", "private, no-store");

  // BOM so Excel reads UTF-8, then the header row
  res.write(CSV_BOM + csvRow(EXPORT_HEADER));

  let rowCount = 0;
  try {
    let step = first;
    while (!step.done) {
      const chunk = step.value.map((row) => csvRow(toCsvFields(row))).join("");
      rowCount += step.value.length;

      // Backpressure: if the client reads slowly, wait instead of piling the file up in memory
      if (!res.write(chunk)) {
        await waitForDrain(res);
      }

      // The client left (closed the download): stop reading from the database
      if (res.destroyed) {
        logger.warn({ userId: user.id, rowCount }, "Finance export abandoned by the client");
        await batches.return(undefined);
        return;
      }

      step = await batches.next();
    }
    res.end();
    logger.info(
      { userId: user.id, from: toDay(query.from), to: toDay(query.to), rowCount, durationMs: Date.now() - startedAt },
      "Finance export finished",
    );
  } catch (error) {
    // The status line is already sent, so it cannot become a 500: cut the connection so the client sees a FAILED
    // download instead of a file that looks complete but is cut short
    logger.error({ err: error, userId: user.id, rowCount }, "Finance export failed while streaming");
    res.destroy();
  }
}
