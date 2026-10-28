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
            ? "Scanning..."
            : "Scan QR/Barcode"}
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
            ? "Scanning..."
            : "Scan OCR"}
        </button>
    </div>
    );
}