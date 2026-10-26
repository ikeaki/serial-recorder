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
  base64ToBytes,
  bytesToBase64,
  calculateChecksum,
  compressText,
  decompressText,
} from "../utils/configTransfer";

// Config受信時のカメラ映像切り出し
import {
  createCroppedCameraCanvas,
} from "../utils/camera";

import type {
  ScanItem,
} from "../types";

type ReceivedConfigItem = {
  n: string;
  t?: string;
  r?: string;
  v?: string;
};

// Config QR受信開始時に
// App側から渡すカメラ設定
type StartReceiveOptions = {
  video:
    HTMLVideoElement | null;

  scanWidth: number;
  scanHeight: number;

  isMobile: boolean;
  cropTopRate: number;
  cropBottomRate: number;

  // 読み取ったQR文字列を
  // App側の復元処理へ渡す
  onFrame: (
    text: string
  ) => Promise<void>;
};

// Config QR受信開始の結果
export type StartReceiveResult =
  | {
      status: "started";
    }
  | {
      status:
        "camera-not-ready";
    };

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

export type RestoredConfig = {
  items: ScanItem[];
  results:
    Record<string, string>;
  transferId: string;
  checksum: string;
};

export type ProcessReceiveFrameResult =
  | {
      status:
        | "ignored"
        | "receiving";
    }
  | {
      status: "completed";
      config:
        RestoredConfig;
    }
  | {
      status: "failed";
      message: string;
    };

type ProductionResults =
  Record<string, string>;

const FRAME_SIZE = 300;
const FRAME_INTERVAL_MS = 200;

// Config QR送受信のStateと処理を管理
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

  // Config QR受信を停止
  const stopReceiveConfig =
    (): void => {
      // 受信Frame・進捗・識別情報を初期化
      resetReceiveState();

      // 送受信を行っていない状態へ戻す
      setConfigMode("none");

      // 画面表示用の受信状態
      setReceiveStatus(
        "Stopped"
    );
  };

  // Config QR受信を開始
  const startReceiveConfig =
    async ({
      video,
      scanWidth,
      scanHeight,
      isMobile,
      cropTopRate,
      cropBottomRate,
      onFrame,
    }: StartReceiveOptions): Promise<
      StartReceiveResult
    > => {
      // カメラ未準備時は受信を開始しない
      if (!video) {
        setReceiveStatus(
          "Camera Not Ready"
        );

        return {
          status:
            "camera-not-ready",
        };
      }

      // 前回の受信Frame・進捗を初期化
      resetReceiveState();

      setReceiveStatus(
        "Waiting..."
      );

      // Config受信画面へ切り替える
      setConfigMode(
        "receive"
      );

      // 受信ループを有効化
      receiveRunningRef.current =
        true;

      const reader =
        new BrowserMultiFormatReader();

      // Config QRを一定間隔で読み取る
      const scanLoop =
        async (): Promise<void> => {
          // STOP後は次の読取りを行わない
          if (
            !receiveRunningRef.current
          ) {
            return;
          }

          // カメラ映像の準備待ち
          if (
            video.readyState < 2 ||
            video.videoWidth === 0 ||
            video.videoHeight === 0
          ) {
            window.setTimeout(
              scanLoop,
              200
            );

            return;
          }

          try {
            // Config QR用にスキャン範囲を
            // 2倍サイズで切り出す
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
              window.setTimeout(
                scanLoop,
                200
              );

              return;
            }

            const {
              cropCanvas,
            } = captured;

            const image =
              cropCanvas.toDataURL(
                "image/png"
              );

            const img =
              document.createElement(
                "img"
              );

            img.src = image;

            // 画像読込み完了後にQR解析を実行
            await new Promise<void>(
              (
                resolve,
                reject
              ) => {
                img.onload = () => {
                  resolve();
                };

                img.onerror = () => {
                  reject(
                    new Error(
                      "Image Load Failed"
                    )
                  );
                };
              }
            );

            const scanResult =
              await reader
                .decodeFromImageElement(
                  img
                );

            const text =
              scanResult
                .getText()
                .trim();

            // Frame検証・結合・復元処理は
            // App側のコールバックへ渡す
            await onFrame(
              text
            );
          } catch {
            // 読み取れない画像や
            // Config以外のQRは無視して継続
          }

          // 受信中の場合だけ次回読取りを予約
          if (
            receiveRunningRef.current
          ) {
            window.setTimeout(
              scanLoop,
              200
            );
          }
        };

      // 非同期受信ループを開始
      void scanLoop();

      return {
        status: "started",
      };
    };

  // Config QR Frameを受信・検証・復元
  const processReceiveFrame =
    async (
      text: string
    ): Promise<
      ProcessReceiveFrameResult
    > => {
      if (
        !text.startsWith(
          "CFGZ|"
        )
      ) {
        return {
          status: "ignored",
        };
      }

      const parts =
        text.split("|");

      if (
        parts.length !== 6
      ) {
        return {
          status: "ignored",
        };
      }

      const receivedTransferId =
        parts[1];

      const index =
        Number(parts[2]);

      const total =
        Number(parts[3]);

      const checksum =
        parts[4];

      const chunk =
        parts[5];

      if (
        !receivedTransferId ||
        !checksum ||
        !chunk ||
        !Number.isInteger(
          index
        ) ||
        !Number.isInteger(
          total
        ) ||
        index < 1 ||
        total < 1 ||
        index > total
      ) {
        return {
          status: "ignored",
        };
      }

      // 最初のFrameで受信情報を確定
      if (
        !receiveTransferIdRef
          .current
      ) {
        receiveTransferIdRef
          .current =
          receivedTransferId;

        receiveChecksumRef
          .current =
          checksum;

        receiveExpectedTotalRef
          .current =
          total;

        setTransferId(
          receivedTransferId
        );
      }

      // 別TransferのFrameは無視
      if (
        receiveTransferIdRef
          .current !==
        receivedTransferId
      ) {
        return {
          status: "ignored",
        };
      }

      // 異なるChecksumのFrameは無視
      if (
        receiveChecksumRef
          .current !==
        checksum
      ) {
        return {
          status: "ignored",
        };
      }

      // 異なる総Frame数は無視
      if (
        receiveExpectedTotalRef
          .current !==
        total
      ) {
        return {
          status: "ignored",
        };
      }

      // 受信済みFrameは無視
      if (
        receiveFrames.current.has(
          index
        )
      ) {
        return {
          status: "ignored",
        };
      }

      receiveFrames.current.set(
        index,
        chunk
      );

      const count =
        receiveFrames.current
          .size;

      setReceivedCount(
        count
      );

      setReceiveTotal(
        total
      );

      setReceiveStatus(
        `Receiving ${count} / ${total}`
      );

      if (
        count !== total
      ) {
        return {
          status: "receiving",
        };
      }

      receiveRunningRef.current =
        false;

      setReceiveStatus(
        "Checking Data..."
      );

      try {
        const chunks:
          string[] = [];

        for (
          let frame = 1;
          frame <= total;
          frame++
        ) {
          const receivedChunk =
            receiveFrames.current
              .get(frame);

          if (
            !receivedChunk
          ) {
            throw new Error(
              `Missing Frame ${frame}`
            );
          }

          chunks.push(
            receivedChunk
          );
        }

        const base64 =
          chunks.join("");

        const calculatedChecksum =
          await calculateChecksum(
            base64
          );

        if (
          calculatedChecksum !==
          checksum
        ) {
          throw new Error(
            "Checksum Mismatch"
          );
        }

        setReceiveStatus(
          "Restoring Config..."
        );

        const compressedBytes =
          base64ToBytes(
            base64
          );

        const json =
          await decompressText(
            compressedBytes
          );

        const receivedConfig =
          JSON.parse(
            json
          ) as ReceivedConfigItem[];

        const restoredItems:
          ScanItem[] =
            receivedConfig.map(
              item => ({
                name:
                  item.n,
                type:
                  item.t ?? "",
                regex:
                  item.r ?? "",
                value:
                  item.v ?? "",
              })
            );

        const restoredResults =
          Object.fromEntries(
            restoredItems.map(
              item => [
                item.name,
                item.value ?? "",
              ]
            )
          ) as Record<
            string,
            string
          >;

        setReceiveStatus(
          "Checksum OK / Config Loaded"
        );

        return {
          status: "completed",
          config: {
            items:
              restoredItems,
            results:
              restoredResults,
            transferId:
              receivedTransferId,
            checksum,
          },
        };
      } catch (error) {
        console.error(
          "Config Restore Error:",
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : "Restore Failed";

        setReceiveStatus(
          message
        );

        return {
          status: "failed",
          message,
        };
      }
    };
    
  return {
    // 送信・受信共通の画面状態
    configMode,
    transferId,

    // Config送信画面で使用
    sendFrames,
    currentFrame,
    qrImage,

    // Config受信画面で使用
    receivedCount,
    receiveTotal,
    receiveStatus,

    // Config送信操作
    startSendConfig,
    stopSendConfig,

    // Config受信操作
    startReceiveConfig,
    stopReceiveConfig,

    // 受信Frameの検証・結合・復元
    processReceiveFrame,
  };
};