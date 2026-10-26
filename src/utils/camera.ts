// src/utils/camera.ts

export type ScanArea = {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
};

// スキャン範囲の座標とサイズを計算する純粋関数
export const getScanAreaWH = (
  width: number,
  height: number,
  scanWidthPercent: number,
  scanHeightPercent: number
): ScanArea => {
  const cropW =
    width *
    (scanWidthPercent / 100);

  const cropH =
    height *
    (scanHeightPercent / 100);

  const cropX =
    (width - cropW) / 2;

  const cropY =
    (height - cropH) / 2;

  return {
    cropX,
    cropY,
    cropW,
    cropH,
  };
};