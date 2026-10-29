// src/hooks/useScanner.ts

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  BrowserMultiFormatReader,
} from "@zxing/browser";

import {
  createWorker,
} from "tesseract.js";

import type {
  Worker,
} from "tesseract.js";

import {
  createCroppedCameraCanvas,
} from "../utils/camera";

type UseScannerOptions = {
  videoRef:
  React.RefObject<
    HTMLVideoElement | null
  >;

  scanWidth: number;
  scanHeight: number;

  isMobile: boolean;
  cropTopRate: number;
  cropBottomRate: number;
};

// QR／OCR共通の確認画像情報
export type ScanDebugImage = {
  // カメラ全体画像
  sourceCanvas: HTMLCanvasElement;

  // 実際に読取りへ使用した切り出し画像
  cropCanvas: HTMLCanvasElement;

  // カメラ全体画像内の切り出し位置
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
};

export type QrScanResult =
  | {
    // QR／バーコード読取り成功
    status: "success";

    // 読み取った文字列
    text: string;

    // 読取りに使用した確認画像
    debugImage: ScanDebugImage;
  }
  | {
    // 読取り時間切れ
    status: "timeout";

    // 最後に読取りを試した確認画像
    debugImage?: ScanDebugImage;
  }
  | {
    // QR／バーコード読取り失敗
    status: "failed";

    // 画像取得後の失敗なら確認画像を保持
    debugImage?: ScanDebugImage;
  }
  | {
    // カメラ映像を取得できないため画像なし
    status: "camera-not-ready";
  };

export type OcrScanResult =
  | {
    // OCR読取り成功
    status: "success";

    // 読み取った文字列
    text: string;

    // OCR信頼度
    confidence: number;

    // OCRに使用した確認画像
    debugImage: ScanDebugImage;
  }
  | {
    // OCR低信頼度
    status: "low-confidence";

    // 取得できた最高信頼度
    confidence: number;

    // OCRに使用した確認画像
    debugImage: ScanDebugImage;
  }
  | {
    // OCR処理中の失敗
    status: "failed";

    // 取得できている場合のみ返す
    confidence?: number;

    // Canvas作成後の失敗なら返す
    debugImage?: ScanDebugImage;
  }
  | {
    // 確認画像を取得できない状態
    status:
    | "camera-not-ready"
    | "ocr-not-ready"
    | "canvas-failed";
  };


// OCR WorkerとQR読取りを管理
export const useScanner = ({
  videoRef,
  scanWidth,
  scanHeight,
  isMobile,
  cropTopRate,
  cropBottomRate,
}: UseScannerOptions) => {
  const workerRef =
    useRef<Worker | null>(
      null
    );

  const [ocrReady, setOcrReady] =
    useState(false);
  // OCR初期化エラー
  const [
    ocrInitError,
    setOcrInitError,
  ] = useState("");

  const [scanning, setScanning] =
    useState(false);

  const [
    ocrLoading,
    setOcrLoading,
  ] = useState(false);

  const ocrLoadingRef =
    useRef(false);

  const scanningRef =
    useRef(false);

  useEffect(() => {
    let cancelled = false;

    const initOCR =
      async (): Promise<void> => {
        try {
          // 初期化開始時に状態をリセット
          setOcrReady(false);
          setOcrInitError("");

          const worker =
            await createWorker(
              "eng",
              1,
              {
                workerPath:
                  "/tesseract/worker.min.js",

                corePath:
                  "/tesseract/core",

                langPath:
                  "/tesseract/lang",
              }
            );

          if (cancelled) {
            await worker.terminate();
            return;
          }

          workerRef.current =
            worker;

          setOcrReady(true);
        } catch (error) {
          console.error(
            "OCR initialization failed:",
            error
          );

          const message =
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error);

          setOcrReady(false);
          setOcrInitError(message);
        }
      };

    // OCR Workerの初期化を開始
    void initOCR();

    // コンポーネント終了時にOCR Workerを破棄
    return () => {
      cancelled = true;

      const worker =
        workerRef.current;

      workerRef.current =
        null;

      setOcrReady(false);

      if (worker) {
        void worker.terminate();
      }
    };
  }, []);

  // QR／バーコード読取り
  const scanQr =
    async (): Promise<QrScanResult> => {
      if (
        scanningRef.current
      ) {
        return {
          status: "failed",
        };
      }

      const video =
        videoRef.current;

      if (
        !video ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return {
          status:
            "camera-not-ready",
        };
      }

      scanningRef.current =
        true;

      setScanning(true);

      const reader =
        new BrowserMultiFormatReader();

      const timeoutMs = 2000;
      const scanIntervalMs = 120;

      const startTime =
        performance.now();

      // タイムアウト・失敗時にも返せるよう、
      // 最後に取得した確認画像を保持
      let lastDebugImage:
        | ScanDebugImage
        | undefined;

      try {
        while (
          performance.now() -
          startTime <
          timeoutMs
        ) {
          const captured =
            createCroppedCameraCanvas(
              video,
              2,
              scanWidth,
              scanHeight,
              isMobile,
              cropTopRate,
              cropBottomRate
            );

          if (!captured) {
            throw new Error(
              "Crop Canvas Create Error"
            );
          }

          const {
            sourceCanvas,
            cropCanvas,
            cropX,
            cropY,
            cropW,
            cropH,
          } = captured;

          // 今回のQR／バーコード読取りに使用する確認画像
          const debugImage:
            ScanDebugImage = {
            sourceCanvas,
            cropCanvas,
            cropX,
            cropY,
            cropW,
            cropH,
          };

          // 読取りに失敗しても最後の画像を返せるよう保持
          lastDebugImage =
            debugImage;

          const image =
            cropCanvas.toDataURL(
              "image/png"
            );

          const img =
            document.createElement(
              "img"
            );

          img.src = image;

          await new Promise<void>(
            (resolve, reject) => {
              img.onload = () => {
                resolve();
              };

              img.onerror = () => {
                reject(
                  new Error(
                    "Image Load Error"
                  )
                );
              };
            }
          );

          try {
            const scanResult =
              await reader
                .decodeFromImageElement(
                  img
                );

            const text =
              scanResult
                .getText()
                .trim();

            if (text) {
              return {
                status: "success",
                text,

                // 成功時に使用した確認画像
                debugImage,
              };
            }
          } catch {
            // 読めない画像は次回へ
          }

          await new Promise<void>(
            resolve => {
              window.setTimeout(
                resolve,
                scanIntervalMs
              );
            }
          );
        }

        return {
          status: "timeout",

          // 最後に読取りを試した画像
          debugImage:
            lastDebugImage,
        };
      } catch (error) {
        console.error(
          "QR Scan Error:",
          error
        );

        return {
          status: "failed",

          // Canvas取得後の失敗なら確認画像を返す
          debugImage:
            lastDebugImage,
        };
      } finally {
        scanningRef.current =
          false;

        setScanning(false);
      }
    };


  // scanQr()の後に追加

  const runOCR =
    async (): Promise<OcrScanResult> => {
      const video =
        videoRef.current;

      if (!video) {
        return {
          status:
            "camera-not-ready",
        };
      }

      const worker =
        workerRef.current;

      if (!worker) {
        return {
          status:
            "ocr-not-ready",
        };
      }

      if (ocrLoadingRef.current) {
        return {
          status: "failed",
        };
      }

      ocrLoadingRef.current = true;

      setOcrLoading(true);

      // OCR処理中の例外でも返せるよう、
      // 取得済みの確認画像を保持
      let lastDebugImage:
        | ScanDebugImage
        | undefined;

      try {
        // OCR用Canvasを4倍で切り出す
        const captured =
          createCroppedCameraCanvas(
            video,
            4,
            scanWidth,
            scanHeight,
            isMobile,
            cropTopRate,
            cropBottomRate
          );

        if (!captured) {
          return {
            status:
              "canvas-failed",
          };
        }

        const {
          sourceCanvas,
          cropCanvas,
          cropX,
          cropY,
          cropW,
          cropH,
        } = captured;

        // 今回のOCRに使用する確認画像
        const debugImage:
          ScanDebugImage = {
          sourceCanvas,
          cropCanvas,
          cropX,
          cropY,
          cropW,
          cropH,
        };

        // OCR途中の例外でも返せるよう保持
        lastDebugImage =
          debugImage;

        const thresholds = [
          120,
          140,
          160,
          180,
          200,
        ];

        let bestText = "";
        let bestConfidence = 0;

        for (
          const threshold of
          thresholds
        ) {
          const workCanvas =
            document.createElement(
              "canvas"
            );

          workCanvas.width =
            cropCanvas.width;

          workCanvas.height =
            cropCanvas.height;

          const workCtx =
            workCanvas.getContext(
              "2d"
            );

          if (!workCtx) {
            continue;
          }

          workCtx.drawImage(
            cropCanvas,
            0,
            0
          );

          const imageData =
            workCtx.getImageData(
              0,
              0,
              workCanvas.width,
              workCanvas.height
            );

          const data =
            imageData.data;

          for (
            let i = 0;
            i < data.length;
            i += 4
          ) {
            const gray =
              data[i] * 0.299 +
              data[i + 1] * 0.587 +
              data[i + 2] * 0.114;

            const value =
              gray > threshold
                ? 255
                : 0;

            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
          }

          workCtx.putImageData(
            imageData,
            0,
            0
          );

          const image =
            workCanvas.toDataURL(
              "image/png"
            );

          const result =
            await worker.recognize(
              image,
              {
                tessedit_char_whitelist:
                  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ=",
              } as any
            );

          const text =
            result.data.text
              .trim()
              .replace(/\s/g, "");

          const confidence =
            result.data.confidence;

          console.log({
            threshold,
            text,
            confidence,
          });

          if (
            text.length > 0 &&
            confidence >= 50 &&
            confidence >
            bestConfidence
          ) {
            bestText = text;

            bestConfidence =
              confidence;
          }
        }

        if (
          bestConfidence < 50 ||
          !bestText
        ) {
          return {
            status:
              "low-confidence",
            confidence:
              bestConfidence,

            // 低信頼度でも確認画像を返す
            debugImage,
          };
        }

        return {
          status: "success",

          text:
            bestText,

          confidence:
            bestConfidence,

          // OCRに使用した確認画像
          debugImage,
        };
      } catch (error) {
        console.error(
          "OCR Scan Error:",
          error
        );

        return {
          status: "failed",

          // Canvas取得後の失敗なら確認画像を返す
          debugImage:
            lastDebugImage,
        };
      } finally {
        // OCR実行状態を必ず解除
        ocrLoadingRef.current = false;
        setOcrLoading(false);
      }
    };


  return {
    ocrReady,
    ocrInitError,
    scanning,
    scanQr,
    ocrLoading,
    runOCR,
  };
};
