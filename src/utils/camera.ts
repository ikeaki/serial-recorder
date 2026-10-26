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

// カメラ映像をCanvasへ描画
export const drawCameraFrame = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  isMobile: boolean,
  cropTopRate: number,
  cropBottomRate: number
): number => {
  if (isMobile) {
    const srcY =
      video.videoHeight *
      cropTopRate;

    const srcH =
      video.videoHeight *
      (
        1 -
        cropTopRate -
        cropBottomRate
      );

    const drawHeight =
      canvas.width *
      (
        srcH /
        video.videoWidth
      );

    canvas.height =
      drawHeight;

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.drawImage(
      video,
      0,
      srcY,
      video.videoWidth,
      srcH,
      0,
      0,
      canvas.width,
      drawHeight
    );

    return drawHeight;
  }

  canvas.height =
    video.videoHeight;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.height;
};