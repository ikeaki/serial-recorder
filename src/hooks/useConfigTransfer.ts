// src/hooks/useConfigTransfer.ts

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  BrowserMultiFormatReader,
} from "@zxing/browser";

import QRCode from "qrcode";

import {
  bytesToBase64,
  calculateChecksum,
  compressText,
} from "../utils/configTransfer";

import type {
  ScanItem,
} from "../types";

export type ConfigMode =
  | "none"
  | "send"
  | "receive";

export type StartSendResult =
  | {
      status: "success";
      frameCount: number;
    }
  | {
      status: "failed";
    };

type ProductionResults =
  Record<string, string>;

const FRAME_SIZE = 300;
const FRAME_INTERVAL_MS = 200;

// Config QR送受信を管理
// 第1段階では送信側のみ実装
export const useConfigTransfer = () => {
  const [
    configMode,
    setConfigMode,
  ] = useState<ConfigMode>(
    "none"
  );

  const [
    sendFrames,
    setSendFrames,
  ] = useState<string[]>([]);

  const [
    currentFrame,
    setCurrentFrame,
  ] = useState(0);

  const [
    qrImage,
    setQrImage,
  ] = useState("");

  const [
    transferId,
    setTransferId,
  ] = useState("");

  // Config QR受信Frameを保持
  const receiveFrames =
  useRef<Map<number, string>>(
      new Map()
  );

  // Config QR受信ループの実行状態
  const receiveRunningRef =
  useRef(false);

  // Config QR受信用Reader
  const receiveReaderRef =
  useRef<
      BrowserMultiFormatReader | null
  >(null);

  // 受信済みFrame数
  const [
  receivedCount,
  setReceivedCount,
  ] = useState(0);

  // 受信予定Frame総数
  const [
  receiveTotal,
  setReceiveTotal,
  ] = useState(0);

  // Config受信状態の表示
  const [
  receiveStatus,
  setReceiveStatus,
  ] = useState(
  "Waiting..."
  );

  // 受信中のTransfer ID
  const receiveTransferIdRef =
  useRef("");

  // 受信中のChecksum
  const receiveChecksumRef =
  useRef("");

  // 受信予定Frame総数
  const receiveExpectedTotalRef =
  useRef(0);

  // 送信Frameを一定間隔で切替
  useEffect(() => {
    if (
      configMode !== "send" ||
      sendFrames.length === 0
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setCurrentFrame(
            previous =>
              (
                previous + 1
              ) %
              sendFrames.length
          );
        },
        FRAME_INTERVAL_MS
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    configMode,
    sendFrames,
  ]);

  // 現在FrameのQR画像を生成
  useEffect(() => {
    let cancelled = false;

    if (
      configMode !== "send" ||
      sendFrames.length === 0
    ) {
      setQrImage("");
      return;
    }

    const frame =
      sendFrames[
        currentFrame
      ];

    if (!frame) {
      setQrImage("");
      return;
    }

    setQrImage("");

    void QRCode.toDataURL(
      frame
    )
      .then(image => {
        if (!cancelled) {
          setQrImage(image);
        }
      })
      .catch(error => {
        console.error(
          "Config QR Create Error:",
          error
        );

        if (!cancelled) {
          setQrImage("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    configMode,
    currentFrame,
    sendFrames,
  ]);

  // ConfigデータをQR Frameへ変換して送信開始
  const startSendConfig =
    async (
      items: ScanItem[],
      results:
        ProductionResults
    ): Promise<StartSendResult> => {
      try {
        const configData =
          items.map(item => ({
            n: item.name,
            t:
              item.type ?? "",
            r:
              item.regex ?? "",
            v:
              results[
                item.name
              ] ??
              item.value ??
              "",
          }));

        const json =
          JSON.stringify(
            configData
          );

        const compressedBytes =
          await compressText(
            json
          );

        const base64 =
          bytesToBase64(
            compressedBytes
          );

        const checksum =
          await calculateChecksum(
            base64
          );

        const newTransferId =
          crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()
                .toString(16)
                .slice(2)}`;

        const total =
          Math.ceil(
            base64.length /
              FRAME_SIZE
          );

        const frames:
          string[] = [];

        for (
          let index = 0;
          index < total;
          index++
        ) {
          const chunk =
            base64.slice(
              index *
                FRAME_SIZE,
              (
                index + 1
              ) *
                FRAME_SIZE
            );

          frames.push(
            [
              "CFGZ",
              newTransferId,
              String(
                index + 1
              ).padStart(
                4,
                "0"
              ),
              String(
                total
              ).padStart(
                4,
                "0"
              ),
              checksum,
              chunk,
            ].join("|")
          );
        }

        setTransferId(
          newTransferId
        );

        setQrImage("");
        setSendFrames(frames);
        setCurrentFrame(0);
        setConfigMode("send");

        return {
          status: "success",
          frameCount:
            frames.length,
        };
      } catch (error) {
        console.error(
          "Send Config Error:",
          error
        );

        setConfigMode("none");
        setSendFrames([]);
        setCurrentFrame(0);
        setQrImage("");

        return {
          status: "failed",
        };
      }
    };

  // Config QR送信を停止
  const stopSendConfig =
    (): void => {
      setConfigMode("none");
      setSendFrames([]);
      setCurrentFrame(0);
      setQrImage("");
    };

  // Config受信データと進捗状態を初期化
  const resetReceiveState =
    (): void => {
      receiveRunningRef.current =
        false;

      receiveFrames.current.clear();

      receiveTransferIdRef.current =
        "";

      receiveChecksumRef.current =
        "";

      receiveExpectedTotalRef.current =
        0;

      setTransferId("");
      setReceivedCount(0);
      setReceiveTotal(0);
    };

  return {
    // 送信・受信共通
    configMode,
    transferId,

    // 送信側
    sendFrames,
    currentFrame,
    qrImage,
    startSendConfig,
    stopSendConfig,

    // 受信側の画面表示
    receivedCount,
    receiveTotal,
    receiveStatus,

    // 受信処理をHookへ完全移動するまで一時公開
    receiveFrames,
    receiveRunningRef,
    receiveReaderRef,
    receiveTransferIdRef,
    receiveChecksumRef,
    receiveExpectedTotalRef,

    setReceivedCount,
    setReceiveTotal,
    setReceiveStatus,

    resetReceiveState,

    // 受信処理をHookへ完全移動するまで一時公開
    setConfigMode,
    setTransferId,
  };
};