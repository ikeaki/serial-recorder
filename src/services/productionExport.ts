// src/services/productionExport.ts

import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import QRCode from "qrcode";

import {
  createProductionFileName,
  downloadBlob,
} from "../utils/file";

import type {
  ScanItem,
} from "../types";

type ProductionResults =
  Record<string, string>;

const EXCEL_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// 出力時のValueを取得
const getProductionValue = (
  item: ScanItem,
  results: ProductionResults,
  exportTime: string
): string => {
  if (
    item.name ===
    "Export Time"
  ) {
    return exportTime;
  }

  return (
    results[item.name] ??
    ""
  );
};

// QRなしExcelを出力
export const exportProductionExcel = (
  items: ScanItem[],
  results: ProductionResults
): void => {
  const exportTime =
    new Date().toLocaleString();

  const exportData = [
    [
      "Name",
      "Type",
      "Regex",
      "Value",
    ],

    ...items.map(item => [
      item.name,
      item.type ?? "",
      item.regex ?? "",
      getProductionValue(
        item,
        results,
        exportTime
      ),
    ]),
  ];

  const worksheet =
    XLSX.utils.aoa_to_sheet(
      exportData
    );

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Production"
  );

  const fileName =
    createProductionFileName(
      results["Model"],
      "xlsx"
    );

  const excelBuffer =
    XLSX.write(
      workbook,
      {
        bookType: "xlsx",
        type: "array",
      }
    );

  const blob =
    new Blob(
      [excelBuffer],
      {
        type:
          EXCEL_MIME_TYPE,
      }
    );

  downloadBlob(
    blob,
    fileName
  );
};

// QR付きExcelを出力
export const exportProductionExcelWithQr =
  async (
    items: ScanItem[],
    results: ProductionResults
  ): Promise<void> => {
    const workbook =
      new ExcelJS.Workbook();

    const sheet =
      workbook.addWorksheet(
        "Production"
      );

    sheet.columns = [
      {
        header: "Name",
        key: "name",
        width: 25,
      },
      {
        header: "Type",
        key: "type",
        width: 10,
      },
      {
        header: "Regex",
        key: "regex",
        width: 35,
      },
      {
        header: "Value",
        key: "value",
        width: 35,
      },
      {
        header: "QR",
        key: "qr",
        width: 15,
      },
    ];

    const exportTime =
      new Date().toLocaleString();

    for (
      let i = 0;
      i < items.length;
      i++
    ) {
      const item =
        items[i];

      const value =
        getProductionValue(
          item,
          results,
          exportTime
        );

      sheet.addRow([
        item.name,
        item.type ?? "",
        item.regex ?? "",
        value,
        "",
      ]);

      const row =
        sheet.getRow(i + 2);

      row.height = 65;

      if (
        !String(value).trim()
      ) {
        continue;
      }

      try {
        const qrBase64 =
          await QRCode.toDataURL(
            String(value),
            {
              margin: 1,
              width: 300,
            }
          );

        const imageId =
          workbook.addImage({
            base64: qrBase64,
            extension: "png",
          });

        sheet.addImage(
          imageId,
          {
            tl: {
              col: 4,
              row: i + 1,
            },
            ext: {
              width: 60,
              height: 60,
            },
          }
        );
      } catch (err) {
        console.error(
          "QR Create Error:",
          value,
          err
        );
      }
    }

    sheet.getRow(1).font = {
      bold: true,
    };

    const buffer =
      await workbook.xlsx
        .writeBuffer();

    const blob =
      new Blob(
        [buffer],
        {
          type:
            EXCEL_MIME_TYPE,
        }
      );

    const fileName =
      createProductionFileName(
        results["Model"],
        "xlsx",
        "QR"
      );

    downloadBlob(
      blob,
      fileName
    );
  };

// CSVを出力
export const exportProductionCsv = (
  items: ScanItem[],
  results: ProductionResults
): void => {
  const exportTime =
    new Date().toLocaleString();

  const csvRows = [
    [
      "Name",
      "Type",
      "Regex",
      "Value",
    ],

    ...items.map(item => [
      item.name,
      item.type ?? "",
      item.regex ?? "",
      getProductionValue(
        item,
        results,
        exportTime
      ),
    ]),
  ];

  const csvText =
    csvRows
      .map(row =>
        row
          .map(value =>
            `"${String(value)
              .replace(
                /"/g,
                '""'
              )}"`
          )
          .join(",")
      )
      .join("\r\n");

  const fileName =
    createProductionFileName(
      results["Model"],
      "csv"
    );

  const blob =
    new Blob(
      [
        "\uFEFF" +
        csvText,
      ],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    );

  downloadBlob(
    blob,
    fileName
  );
};