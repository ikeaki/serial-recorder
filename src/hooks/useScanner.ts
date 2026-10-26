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

export type QrScanResult =
  | {
      status: "success";
      text: string;
    }
  | {
      status:
        | "camera-not-ready"
        | "timeout"
        | "failed";
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

  const [scanning, setScanning] =
    useState(false);

  const scanningRef =
    useRef(false);

  useEffect(() => {
    let cancelled = false;

    const initOCR =
      async (): Promise<void> => {
        const worker =
          await createWorker(
            "eng"
          );

        if (cancelled) {
          await worker.terminate();
          return;
        }

        workerRef.current =
          worker;

        setOcrReady(true);
      };

    void initOCR();

    return () => {
      cancelled = true;

      const worker =
        workerRef.current;

      workerRef.current =
        null;

      if (worker) {
        void worker.terminate();
      }
    };
  }, []);

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

          const { cropCanvas } =
            captured;

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
        };
      } catch (error) {
        console.error(
          "QR Scan Error:",
          error
        );

        return {
          status: "failed",
        };
      } finally {
        scanningRef.current =
          false;

        setScanning(false);
      }
    };

  return {
    workerRef,
    ocrReady,
    scanning,
    scanQr,
  };
};