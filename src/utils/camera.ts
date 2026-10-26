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


export type CroppedCameraCanvas = {
  sourceCanvas: HTMLCanvasElement;
  cropCanvas: HTMLCanvasElement;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
};

// カメラ映像からスキャン範囲を切り出す
export const createCroppedCameraCanvas = (
  video: HTMLVideoElement,
  scale: number,
  scanWidthPercent: number,
  scanHeightPercent: number,
  isMobile: boolean,
  cropTopRate: number,
  cropBottomRate: number
): CroppedCameraCanvas | null => {
  const sourceCanvas =
    document.createElement("canvas");

  sourceCanvas.width =
    video.videoWidth;

  sourceCanvas.height =
    video.videoHeight;

  const sourceCtx =
    sourceCanvas.getContext("2d");

  if (!sourceCtx) {
    return null;
  }

  const drawHeight =
    drawCameraFrame(
      sourceCtx,
      sourceCanvas,
      video,
      isMobile,
      cropTopRate,
      cropBottomRate
    );

  const {
    cropX,
    cropY,
    cropW,
    cropH,
  } = getScanAreaWH(
    sourceCanvas.width,
    drawHeight,
    scanWidthPercent,
    scanHeightPercent
  );

  const cropCanvas =
    document.createElement("canvas");

  cropCanvas.width =
    Math.round(
      cropW * scale
    );

  cropCanvas.height =
    Math.round(
      cropH * scale
    );

  const cropCtx =
    cropCanvas.getContext("2d");

  if (!cropCtx) {
    return null;
  }

  cropCtx.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropW,
    cropH,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height
  );

  return {
    sourceCanvas,
    cropCanvas,
    cropX,
    cropY,
    cropW,
    cropH,
  };
};