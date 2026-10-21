import type { Request, Response } from "express";
import { CSV_BOM, csvRow } from "../../lib/csv";
import { EXPORT_HEADER, toDay } from "./finance.service";
import type { ExportQuery } from "./finance.schemas";

// GET /finance/export?from=&to=: approved claims of the period as a CSV download
export async function exportClaims(req: Request, res: Response) {
  const query = req.query as unknown as ExportQuery; // already validated and converted to dates by validate()

  // A download, never rendered in the browser
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="approved-claims_${toDay(query.from)}_${toDay(query.to)}.csv"`);
  res.setHeader("Cache-Control", "private, no-store");

  // BOM so Excel reads UTF-8, then the header row (the claim rows are streamed in the next steps)
  res.write(CSV_BOM + csvRow(EXPORT_HEADER));
  res.end();
}
