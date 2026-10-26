// src/utils/file.ts

// Blobデータを指定ファイル名でダウンロード
export const downloadBlob = (
  blob: Blob,
  fileName: string
): void => {
  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  try {
    link.href = url;
    link.download = fileName;

    document.body.appendChild(
      link
    );

    link.click();
  } finally {
    link.remove();

    URL.revokeObjectURL(url);
  }
};

// Production出力ファイル名を生成
export const createProductionFileName = (
  modelName: string | undefined,
  extension: "xlsx" | "csv",
  suffix?: string
): string => {
  const now = new Date();

  const model =
    (
      modelName ??
      "Production"
    ).replace(
      /[\\/:*?"<>|]/g,
      "_"
    );

  const dateText =
    `${now.getFullYear()}` +
    `${String(
      now.getMonth() + 1
    ).padStart(2, "0")}` +
    `${String(
      now.getDate()
    ).padStart(2, "0")}`;

  const timeText =
    `${String(
      now.getHours()
    ).padStart(2, "0")}` +
    `${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

  const suffixText =
    suffix
      ? `-${suffix}`
      : "";

  return (
    `${model}${suffixText}-` +
    `${dateText}-${timeText}.` +
    extension
  );
};