// src/hooks/useScanner.ts

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createWorker,
} from "tesseract.js";

import type {
  Worker,
} from "tesseract.js";

// OCR Workerの初期化と終了を管理
export const useScanner = () => {
  const workerRef =
    useRef<Worker | null>(
      null
    );

  const [ocrReady, setOcrReady] =
    useState(false);

  useEffect(() => {
    let cancelled =
      false;

    const initOCR =
      async (): Promise<void> => {
        const worker =
          await createWorker(
            "eng"
          );

        // 初期化中に画面が破棄された場合
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

      setOcrReady(false);

      if (worker) {
        void worker.terminate();
      }
    };
  }, []);

  return {
    workerRef,
    ocrReady,
  };
};