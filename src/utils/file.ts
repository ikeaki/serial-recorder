  // Blobデータを指定ファイル名でダウンロード
export  const downloadBlob = (
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
  