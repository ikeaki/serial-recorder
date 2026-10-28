import {
  useTranslation,
} from "react-i18next";

type ScanButtonsProps = {
  // QR・バーコードを読み取り中か
  scanning: boolean;

  // OCRを実行中か
  ocrLoading: boolean;

  // OCRを実行できる準備が完了しているか
  ocrReady: boolean;

  // QR・バーコード読取ボタン押下時の処理
  onScanQr: () => void;

  // OCR読取ボタン押下時の処理
  onRunOCR: () => void;
};

export function ScanButtons({
  scanning,
  ocrLoading,
  ocrReady,
  onScanQr,
  onRunOCR,
}: ScanButtonsProps) {

  // 現在の言語に対応した翻訳関数を取得
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        marginTop: "10px",
      }}
    >
      {/* QR・バーコード読取ボタン */}
      <button
        style={{
          flex: 1,
          height: "48px",
          fontSize: "16px",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        disabled={
          scanning ||
          ocrLoading
        }
        onClick={onScanQr}
      >
        {scanning
          ? t("common.scanning")
          : t("scan.qrBarcode")}
      </button>

      {/* OCR読取ボタン */}
      <button
        style={{
          flex: 1,
          height: "48px",
          fontSize: "16px",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        disabled={
          scanning ||
          ocrLoading ||
          !ocrReady
        }
        onClick={onRunOCR}
      >
        {ocrLoading
          ? t("common.scanning")
          : t("scan.ocr")}
      </button>
    </div>
  );
}