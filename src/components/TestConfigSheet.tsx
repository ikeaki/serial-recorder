import {
  useTranslation,
} from "react-i18next";

import type {
  AppLanguage,
} from "../i18n/i18n";

import {
  LanguageSelector,
} from "./LanguageSelector";

type ConfigMode =
  | "none"
  | "send"
  | "receive";

type TestConfigSheetProps = {
  // Config送受信モード
  configMode: ConfigMode;

  // TESTシートが開いているか
  testSheetOpen: boolean;

  // 送信用QR画像
  qrImage: string;

  // 現在送信中のフレーム位置
  currentFrame: number;

  // 送信フレーム総数
  sendFrameCount: number;

  // 受信中のConfig識別子
  transferId: string;

  // 受信済みフレーム数
  receivedCount: number;

  // 受信予定フレーム総数
  receiveTotal: number;

  // Config受信状態
  receiveStatus: string;

  // TESTシートの開閉処理
  onToggleSheet: () => void;

  // Config送信開始処理
  onSendConfig: () => void | Promise<void>;

  // Config受信開始処理
  onReceiveConfig: () => void | Promise<void>;

  // Config送信停止処理
  onStopSend: () => void;

  // Config受信停止処理
  onStopReceive: () => void;

  // 現在選択中の表示言語
  language: AppLanguage;

  // 表示言語の変更処理
  onLanguageChange: (
    language: AppLanguage
  ) => void | Promise<void>;

};

export function TestConfigSheet({
  configMode,
  testSheetOpen,
  qrImage,
  currentFrame,
  sendFrameCount,
  transferId,
  receivedCount,
  receiveTotal,
  receiveStatus,
  onToggleSheet,
  onSendConfig,
  onReceiveConfig,
  onStopSend,
  onStopReceive,
  language,
  onLanguageChange,
}: TestConfigSheetProps) {

  // 現在の言語に対応した翻訳関数を取得
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,

        height:
          configMode === "send"
            ? "100dvh"
            : testSheetOpen
              ? "320px"
              : "40px",

        background: "white",

        borderTopLeftRadius:
          configMode === "send"
            ? "0px"
            : "16px",

        borderTopRightRadius:
          configMode === "send"
            ? "0px"
            : "16px",

        transition: "height 0.3s",
        zIndex: 1000,

        boxShadow:
          "0 -2px 10px rgba(0,0,0,0.2)",

        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Config送信中以外は開閉ハンドルを表示 */}
      {configMode !== "send" && (
        <div
          onClick={onToggleSheet}
          style={{
            height: "40px",
            minHeight: "40px",

            display: "flex",
            justifyContent: "center",
            alignItems: "center",

            cursor: "pointer",
          }}
        >
          {/* シート開閉用のバー */}
          <div
            style={{
              width: "40px",
              height: "4px",
              borderRadius: "2px",
              background: "#999",
            }}
          />
        </div>
      )}

      {/* シート展開中またはConfig送信中に内容を表示 */}
      {(testSheetOpen ||
        configMode === "send") && (
          <div
            style={{
              flex: 1,
              minHeight: 0,

              padding:
                configMode === "send"
                  ? "8px"
                  : "10px",

              display: "flex",
              flexDirection: "column",
              gap: "10px",

              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >

            {/* Config送信中以外は表示言語選択を表示 */}
            {configMode !== "send" && (
              <LanguageSelector
                language={language}
                onLanguageChange={
                  onLanguageChange
                }
              />
            )}

            {/* Config送信中以外は送信／受信ボタンを表示 */}
            {configMode !== "send" && (
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexShrink: 0,
                }}
              >
                {/* Config送信開始 */}
                <button
                  style={{
                    flex: 1,
                    height: "50px",
                  }}
                  onClick={onSendConfig}
                >
                  {t("config.send")}
                </button>

                {/* Config受信開始 */}
                <button
                  style={{
                    flex: 1,
                    height: "50px",
                  }}
                  onClick={onReceiveConfig}
                >
                  {t("config.receive")}
                </button>
              </div>
            )}

            {/* Configモード未選択時の案内 */}
            {configMode === "none" && (
              <div
                style={{
                  border:
                    "1px solid #ccc",
                  borderRadius: "8px",

                  flex: 1,

                  display: "flex",
                  justifyContent:
                    "center",
                  alignItems: "center",
                }}
              >
                {t("config.selectMode")}
              </div>
            )}

            {/* Config送信中のQR表示 */}
            {configMode === "send" && (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  width: "100%",

                  display: "flex",
                  flexDirection: "column",
                  justifyContent:
                    "center",
                  alignItems: "center",

                  overflow: "hidden",
                }}
              >
                {/* 生成済みの送信用QRを表示 */}
                {qrImage ? (
                  <img
                    src={qrImage}
                    alt="QR Code"
                    style={{
                      height:
                        "min(94vw, calc(100dvh - 110px))",

                      maxWidth: "100%",
                      objectFit:
                        "contain",
                      display: "block",
                    }}
                  />
                ) : (
                  <div>
                    {t("config.generatingQr")}
                  </div>
                )}

                {/* 現在送信中のフレーム位置 */}
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "18px",
                    fontWeight: "bold",
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {t("config.frameProgress", {
                    current: currentFrame + 1,
                    total: sendFrameCount,
                  })}
                </div>

                {/* Config送信停止 */}
                <button
                  type="button"
                  onClick={onStopSend}
                  style={{
                    marginTop: "8px",
                    width: "160px",
                    height: "44px",
                    fontSize: "16px",
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  {t("common.stop")}
                </button>
              </div>
            )}

            {/* Config受信中の状態表示 */}
            {configMode ===
              "receive" && (
                <div
                  style={{
                    flex: 1,

                    display: "flex",
                    flexDirection: "column",
                    justifyContent:
                      "center",
                    alignItems: "center",
                  }}
                >
                  {/* Config受信状態 */}
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    {receiveStatus}
                  </div>

                  {/* 受信中のConfig識別子 */}
                  <div
                    style={{
                      marginTop: "4px",
                      maxWidth: "90%",
                      overflow: "hidden",
                      textOverflow:
                        "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "11px",
                      color: "#666",
                    }}
                  >
                    {t("config.id")}:{" "}
                    {transferId || "-"}
                  </div>

                  {/* 受信済みフレーム数 */}
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "16px",
                    }}
                  >
                    {receivedCount}
                    {" / "}
                    {receiveTotal}
                  </div>

                  {/* Config受信進捗バー */}
                  <div
                    style={{
                      marginTop: "8px",
                      width: "80%",
                      height: "12px",
                      borderRadius: "6px",
                      background: "#ddd",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width:
                          receiveTotal > 0
                            ? `${(
                              receivedCount /
                              receiveTotal
                            ) * 100
                            }%`
                            : "0%",

                        height: "100%",
                        background:
                          "#22c55e",

                        transition:
                          "width 0.2s",
                      }}
                    />
                  </div>

                  {/* Config受信進捗率 */}
                  <div
                    style={{
                      marginTop: "4px",
                      fontWeight: "bold",
                    }}
                  >
                    {receiveTotal > 0
                      ? Math.floor(
                        (
                          receivedCount /
                          receiveTotal
                        ) * 100
                      )
                      : 0}
                    %
                  </div>

                  {/* Config受信停止 */}
                  <button
                    type="button"
                    onClick={onStopReceive}
                    style={{
                      marginTop: "8px",
                      width: "140px",
                      height: "36px",
                    }}
                  >
                    {t("common.stop")}
                  </button>
                </div>
              )}
          </div>
        )}
    </div>
  );

}