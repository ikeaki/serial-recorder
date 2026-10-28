import type { ScanItem } from "../types";

import { ResultOverlay } from "./ResultOverlay";
import { ProductionProgress } from "./ProductionProgress";

// カメラスキャンエリア切り出し
import {
  getScanAreaWH,
} from "../utils/camera";

type CameraPreviewProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;

  isMobile: boolean;

  overlayMessage: string;
  overlayColor: string;

  results: Record<string, string>;

  items: ScanItem[];
  currentIndex: number;

  progressCount: number;
  totalCount: number;

  scanWidth: number;
  scanHeight: number;

  zoom: number;

  changeZoom: (delta: number) => void;

  setScanWidth: React.Dispatch<
    React.SetStateAction<number>
  >;

  setScanHeight: React.Dispatch<
    React.SetStateAction<number>
  >;

  vibrateSuccess: () => void;
};

export function CameraPreview({
  videoRef,
  previewCanvasRef,

  isMobile,

  overlayMessage,
  overlayColor,

  results,
  items,
  currentIndex,

  progressCount,
  totalCount,

  scanWidth,
  scanHeight,
  zoom,

  changeZoom,

  setScanWidth,
  setScanHeight,

  vibrateSuccess,
  }: CameraPreviewProps) {
  return (
  <div
      style={{
      position: "relative",
      width: "100%",
      maxWidth: isMobile
          ? "320px"
          : "450px",
      margin: "0 auto",
      overflow: "visible",
      borderRadius: "8px",

      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none",

      touchAction: "manipulation",
      }}
  >

      {/* カメラ映像取得用。映像自体は画面外に配置 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
        }}
      />

      <canvas
        ref={previewCanvasRef}
        onContextMenu={(e) => e.preventDefault()}

        onClick={(e) => {

          const rect =
            e.currentTarget.getBoundingClientRect();

          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          const w = rect.width;
          const h = rect.height;

        // クリック位置判定用のスキャン範囲
        const {
          cropX,
          cropY,
          cropW,
          cropH,
        } = getScanAreaWH(
          w,
          h,
          scanWidth,
          scanHeight
        );

        // 左上 → Zoom +
        if (
          x < cropX &&
          y < cropY
        ) {

          changeZoom(0.5);
          vibrateSuccess();
          return;

        }

        // 左下 → Zoom -
        if (
          x < cropX &&
          y > cropY + cropH
        ) {

          changeZoom(-0.5);
          vibrateSuccess();
          return;

        }

        // 上 → Height +
        if (
          x >= cropX &&
          x <= cropX + cropW &&
          y < cropY
        ) {

          setScanHeight(prev =>
            Math.min(60, prev + 5)
          );

          vibrateSuccess();
        }

        // 下 → Height -
        else if (
          x >= cropX &&
          x <= cropX + cropW &&
          y > cropY + cropH
        ) {

          setScanHeight(prev =>
            Math.max(5, prev - 5)
          );

          vibrateSuccess();
        }

        // 左 → Width +
        else if (
          x < cropX &&
          y >= cropY &&
          y <= cropY + cropH
        ) {

          setScanWidth(prev =>
            Math.min(90, prev + 5)
          );

          vibrateSuccess();
        }

        // 右 → Width -
        else if (
          x > cropX + cropW &&
          y >= cropY &&
          y <= cropY + cropH
        ) {

          setScanWidth(prev =>
            Math.max(20, prev - 5)
          );

          vibrateSuccess();
        }

        }}

        style={{
          width: "100%",
          height: "auto",
          display: "block",
          cursor: "pointer",

          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          WebkitTapHighlightColor: "transparent",
          
          touchAction: "manipulation",          

        }}
      />

      {/* 判定結果オーバーレイ */}
      <ResultOverlay
        message={overlayMessage}
        color={overlayColor}
      />

      {/* 読み取り進捗表示 */}
      <ProductionProgress
        results={results}
        items={items}
        currentIndex={currentIndex}
        progressCount={progressCount}
        totalCount={totalCount}
      />

      {/* 左下 REGEX等 */}
      <div
        style={{
          position: "absolute",
          left: "6px",
          bottom: "0px",

          color: "white",
          fontSize: "12px",
          fontWeight: "bold",

          textShadow:
            "1px 1px 2px black, -1px -1px 2px black",

          pointerEvents: "none",
        }}
      >
        {`RGX: ${items[currentIndex]?.regex || "OFF"}`}
      </div>

      {/* 右下 Zoom等 */}
      <div
        style={{
          position: "absolute",
          right: "6px",
          bottom: "0px",

          color: "white",
          fontSize: "12px",
          fontWeight: "bold",

          textShadow:
            "1px 1px 2px black, -1px -1px 2px black",

          pointerEvents: "none",
        }}
      >
        {`H:${scanHeight}% W:${scanWidth}% Z:${zoom.toFixed(1)}x`}
      </div>

    </div>
  );
}