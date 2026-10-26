// src/services/configLoader.ts

import * as XLSX from "xlsx";

import type {
  ScanItem,
} from "../types";

export type ParsedConfig = {
  items: ScanItem[];
  results: Record<string, string>;
};

// Excel Configを解析する
export const parseExcelConfig = (
  arrayBuffer: ArrayBuffer
): ParsedConfig => {
  const workbook =
    XLSX.read(
      arrayBuffer,
      {
        type: "array",
      }
    );

  const firstSheetName =
    workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error(
      "Config Sheet Not Found"
    );
  }

  const sheet =
    workbook.Sheets[
      firstSheetName
    ];

  if (!sheet) {
    throw new Error(
      "Config Sheet Not Found"
    );
  }

  const rows =
    XLSX.utils.sheet_to_json<
      unknown[]
    >(
      sheet,
      {
        header: 1,
      }
    );

  const headerRowIndex =
    rows.findIndex(
      row =>
        row[0] === "Name" &&
        row[1] === "Type"
    );

  if (headerRowIndex === -1) {
    throw new Error(
      "Invalid Config Format"
    );
  }

  const items: ScanItem[] =
    rows
      .slice(
        headerRowIndex + 1
      )
      .filter(
        row => row[0]
      )
      .map(row => ({
        name:
          String(
            row[0]
          ),

        type:
          String(
            row[1] ?? ""
          ),

        regex:
          String(
            row[2] ?? ""
          ),

        value:
          String(
            row[3] ?? ""
          ),
      }));

  const results =
    Object.fromEntries(
      items.map(item => [
        item.name,
        item.value ?? "",
      ])
    ) as Record<
      string,
      string
    >;

  return {
    items,
    results,
  };
};