import { useEffect, useRef, useState } from "react";

// Production入力対象判定
import {
  isProductionInputItem,
} from "./utils/production";

// カメラスキャンエリア切り出し
import {
  drawCameraFrame,
  getScanAreaWH,
} from "./utils/camera";

// Config QR送受信管理
import {
  useConfigTransfer,
} from "./hooks/useConfigTransfer";


// productionDB関連
import {
  clearProductionStore,
  loadProductionHistory,
  saveProductionRecord,
} from "./services/productionDb";

// ExportExcelCSV関連
import {
  exportProductionCsv
    as exportProductionCsvFile,
  exportProductionExcel
    as exportProductionExcelFile,
  exportProductionExcelWithQr
    as exportProductionExcelWithQrFile,
} from "./services/productionExport";

// Excel Config解析
import {
  parseExcelConfig,
} from "./services/configLoader";

// ConfigおよびProductionの項目定義
import type {
  ScanItem,
} from "./types";

// 音・振動フィードバック
import {
  useFeedback,
} from "./hooks/useFeedback";

// OCR Scanner管理
import {
  useScanner,
} from "./hooks/useScanner";

// Components
import { ModeTabs } from "./components/ModeTabs";
import { CameraPreview } from "./components/CameraPreview";
import { ScanButtons } from "./components/ScanButtons";
import { ProductionCurrentItem } from "./components/ProductionCurrentItem";
import { TestConfigSheet } from "./components/TestConfigSheet";
import { ProductionSheet } from "./components/ProductionSheet";

const BUILD_DATE = __BUILD_DATE__;


export default function App() {

  const { playSuccess, playError, vibrateSuccess, vibrateError } = useFeedback();

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState("Not Scanned");


  const [scanHeight, setScanHeight] = useState(30);
  const [scanWidth, setScanWidth] = useState(50);
  const [tab, setTab] = useState<"eval" | "prod">("prod");
  const [sheetLevel, setSheetLevel] = useState(0);
  const [testSheetOpen, setTestSheetOpen] =
    useState(false);

  // Config送受信Stateと操作をHookから取得
  const {
    configMode,
    sendFrames,
    currentFrame,
    qrImage,
    transferId,

    receivedCount,
    receiveTotal,
    receiveStatus,

    startSendConfig,

    stopSendConfig:
      stopSendConfigFromHook,

    processReceiveFrame:
      processReceiveFrameFromHook,

    startReceiveConfig:
      startReceiveConfigFromHook,

    stopReceiveConfig:
      stopReceiveConfigFromHook,
  } = useConfigTransfer();

  const [results, setResults] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScanItem[]>([]);

  const lastExportClick = useRef(0);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [zoom, setZoom] = useState(1);
  const cropTopRate = 0.2;
  const cropBottomRate = 0.2;
  const isMobile = window.innerWidth <= 768;

  const {
    ocrReady,
    scanning,
    scanQr:
      scanQrFromCamera,
    ocrLoading,
    runOCR:
      runOCRFromCamera,
  } = useScanner({
    videoRef,
    scanWidth,
    scanHeight,
    isMobile,
    cropTopRate,
    cropBottomRate,
  });

  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pressTimer = useRef<number | null>(null);

  const exportLongPressTriggered = useRef(false);

  const [overlayMessage, setOverlayMessage] = useState("");

  const [overlayColor, setOverlayColor] = useState("#00ff00");


  const saveCurrentProduction = async (
    nextResults: Record<string, string> = results
  ) => {
    await saveProductionRecord({
      configItems: items,
      ...nextResults,
      updateTime:
        new Date().toLocaleString(),
    });
  };

  const loadFromOneDrive = async () => {

    try {

      const url = results["ConfigURL"];

      if (!url) {

        playError();
        vibrateError();

        setResult(
          "ConfigURL Not Found"
        );

        return;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          "Download Failed"
        );
      }

      const buffer =
        await response.arrayBuffer();

      await loadExcelConfig(buffer);

      playSuccess();
      vibrateSuccess();

      setResult(
        "ConfigURL Loaded"
      );

    } catch (err) {

      console.error(err);

      playError();
      vibrateError();

      setResult(
        "ConfigURL Load Failed"
      );
    }
  };

  useEffect(() => {

    loadProductionHistory()
      .then(async data => {

        if (data.length > 0) {

          const latest =
            data[data.length - 1];

          const {
            id,
            updateTime,
            configItems,
            ...scanData
          } = latest;

          setResults(scanData);


          if (configItems) {

            setItems(configItems);

            // 最初の未入力Production項目を検索
            const nextIndex =
              configItems.findIndex(
                (item: ScanItem) =>
                  isProductionInputItem(item) &&
                  !(scanData[item.name] ?? "")
                    .toString()
                    .trim()
              );

            setCurrentIndex(
              nextIndex >= 0
                ? nextIndex
                : configItems.length - 1
            );
          }

        } else {

          // 初回だけ default.xlsx
          const response =
            await fetch(
              "/config/default.xlsx"
            );

          const buffer =
            await response.arrayBuffer();

          loadExcelConfig(buffer);

        }

      });

  }, []);
  
  const clearProductionDB = async () => {

    // IndexedDBのProductionデータを削除
    await clearProductionStore();
    // UIもクリア
    setResults({});

    // 最初のProduction入力項目を取得
    const startIndex =
      items.findIndex(
        isProductionInputItem
      );

    setCurrentIndex(startIndex);

    const response =
      await fetch(
        "/config/default.xlsx"
      );

    const buffer =
      await response.arrayBuffer();

    await loadExcelConfig(buffer);

    playSuccess();
    vibrateSuccess();

    console.log(
      "Production Data Cleared"
    );

  };

  // QRなしExcel出力
  const exportProductionExcel =
    () => {
      exportProductionExcelFile(
        items,
        results
      );
    };

  // QR付きExcel出力
  const exportProductionExcelWithQr =
    async () => {
      await exportProductionExcelWithQrFile(
        items,
        results
      );

      playSuccess();
      vibrateSuccess();
    };

  // CSV出力
  const exportProductionCsv =
    () => {
      exportProductionCsvFile(
        items,
        results
      );

      playSuccess();
      vibrateSuccess();
    };

  // Excel Configを解析して画面反映・永続保存
  const loadExcelConfig = async (
    arrayBuffer: ArrayBuffer
  ): Promise<void> => {
    const {
      items: loadedItems,
      results: loadedResults,
    } = parseExcelConfig(
      arrayBuffer
    );

    // 読み込んだConfigを画面へ反映
    setItems(loadedItems);
    setResults(loadedResults);

    // 最初のProduction入力項目を選択
    const startIndex =
      loadedItems.findIndex(
        isProductionInputItem
      );

    setCurrentIndex(
      startIndex >= 0
        ? startIndex
        : 0
    );

    // Configと初期値をIndexedDBへ保存
    await saveProductionRecord({
      configItems: loadedItems,
      ...loadedResults,
      updateTime:
        new Date().toLocaleString(),
    });
  };

  const loadConfig = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {

    const file =
      event.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = e => {

      loadExcelConfig(
        e.target?.result as ArrayBuffer
      );

    };

    reader.readAsArrayBuffer(file);

  };

  // 入力済みProduction項目数
  const progressCount =
    items.filter(
      item =>
        isProductionInputItem(item) &&
        (
          results[item.name] ?? ""
        ).trim() !== ""
    ).length;

    // Production入力対象項目の総数
    const totalCount =
      items.filter(
        isProductionInputItem
      ).length;

  const showOverlay = (
    message: string,
    color: string = "#00ff00"
  ) => {

    setOverlayMessage(message);
    setOverlayColor(color);

    setTimeout(() => {
      setOverlayMessage("");
    }, 1500);

  };

  const applyProductionScan = async (
    text: string
  ): Promise<boolean> => {
    if (
      Object.values(results).includes(text)
    ) {
      setResult(
        "⚠ Duplicate In Current Unit"
      );
      showOverlay(
        "✕ DUP",
        "#ff0000"
      );
      playError();
      vibrateError();

      return false;
    }

    const currentItem =
      items[currentIndex];

    if (!currentItem) {
      setResult(
        "Production Item Not Found"
      );
      showOverlay(
        "✕ ITEM",
        "#ff0000"
      );
      playError();
      vibrateError();

      return false;
    }

    const newResults = {
      ...results,
      [currentItem.name]: text,
    };

    setResults(newResults);

    await saveCurrentProduction(
      newResults
    );

    setCurrentIndex(prev =>
      Math.min(
        prev + 1,
        items.length - 1
      )
    );

    showOverlay(
      "✓ OK",
      "#00ff00"
    );
    playSuccess();
    vibrateSuccess();

    return true;
  };

  
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
        });
    
        const track =
          stream.getVideoTracks()[0];

        trackRef.current = track;

        console.log(
          track.getCapabilities()
        );

        try {

          await track.applyConstraints({
            advanced: [
              {
                focusMode: "continuous",
              } as any,
            ],
          });

          console.log(
            "Auto Focus Enabled"
          );

        } catch (err) {

          console.log(
            "Auto Focus Not Supported"
          );
        }

        //alert("カメラ取得成功");

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          await videoRef.current.play();
           
          console.log(
          "PLAY",
          videoRef.current.currentTime
          );

          videoRef.current.onloadedmetadata = () => {

            const canvas =
              previewCanvasRef.current;

            if (canvas) {
              canvas.width =
                videoRef.current!.videoWidth;

              canvas.height =
                videoRef.current!.videoHeight;

              console.log({
                videoW: videoRef.current!.videoWidth,
                videoH: videoRef.current!.videoHeight,
                canvasW: canvas.width,
                canvasH: canvas.height,
              });
            }

          };
        }
        } catch (err) {
        //  alert("失敗: " + String(err));
        console.error(err);
      
      }
    }

    startCamera();
  }, []);


  useEffect(() => {
    let animationId: number;

    const draw = () => {

      const video = videoRef.current;
      const canvas = previewCanvasRef.current;

      if (video && canvas && video.videoWidth) {

        const ctx = canvas.getContext("2d");

        if (ctx) {

        // カメラプレビューを描画
        const drawHeight =
          drawCameraFrame(
            ctx,
            canvas,
            video,
            isMobile,
            cropTopRate,
            cropBottomRate
          );

          // 現在のスキャン幅・高さで表示範囲を計算
          const {
            cropX,
            cropY,
            cropW,
            cropH,
          } = getScanAreaWH(
            canvas.width,
            drawHeight,
            scanWidth,
            scanHeight
          );

          // 上半分を暗くする
          ctx.fillStyle =
            "rgba(0,0,0,0.45)";

          ctx.fillRect(
            0,
            0,
            canvas.width,
            cropY
          );

          // 下半分を暗くする
          ctx.fillRect(
            0,
            cropY + cropH,
            canvas.width,
            canvas.height -
              (cropY + cropH)
          );

          // スキャン枠
          const corner = 25;

          ctx.strokeStyle = "white";
          ctx.lineWidth = 4;

          // 左上
          ctx.beginPath();
          ctx.moveTo(cropX, cropY + corner);
          ctx.lineTo(cropX, cropY);
          ctx.lineTo(cropX + corner, cropY);
          ctx.stroke();

          // 右上
          ctx.beginPath();
          ctx.moveTo(cropX + cropW - corner, cropY);
          ctx.lineTo(cropX + cropW, cropY);
          ctx.lineTo(cropX + cropW, cropY + corner);
          ctx.stroke();

          // 左下
          ctx.beginPath();
          ctx.moveTo(cropX, cropY + cropH - corner);
          ctx.lineTo(cropX, cropY + cropH);
          ctx.lineTo(cropX + corner, cropY + cropH);
          ctx.stroke();

          // 右下
          ctx.beginPath();
          ctx.moveTo(cropX + cropW - corner, cropY + cropH);
          ctx.lineTo(cropX + cropW, cropY + cropH);
          ctx.lineTo(cropX + cropW, cropY + cropH - corner);
          ctx.stroke();

          // 操作ガイド
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.font = "bold 18px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          ctx.shadowColor = "black";
          ctx.shadowBlur = 4;

          // 上（Height+）
          ctx.fillText(
            "H+",
            canvas.width / 2,
            cropY / 2
          );

          // 下（Height-）
          ctx.fillText(
            "H-",
            canvas.width / 2,
            cropY + cropH +
              (canvas.height - cropY - cropH) / 2
          );

          // 左（Width+）
          ctx.fillText(
            "W+",
            cropX / 2,
            cropY + cropH / 2
          );

          // 右（Width-）
          ctx.fillText(
            "W-",
            cropX + cropW +
              (canvas.width - cropX - cropW) / 2,
            cropY + cropH / 2
          );

          // 左上（Zoom+）
          ctx.fillText(
            "Z+",
            cropX / 2,
            cropY / 2
          );

          // 左下（Zoom-）
          ctx.fillText(
            "Z-",
            cropX / 2,
            cropY + cropH +
              (canvas.height - cropY - cropH) / 2
          );

          ctx.shadowBlur = 0;

        }
      }

      animationId =
        requestAnimationFrame(draw);
    };

    draw();

    return () =>
      cancelAnimationFrame(
        animationId
      );

}, [scanHeight, scanWidth, zoom]);

  
  // QR読取り結果を画面へ反映
  const scanQr = async () => {
    const scanResult =
      await scanQrFromCamera();

    if (
      scanResult.status ===
      "camera-not-ready"
    ) {
      setResult(
        "Camera Not Ready"
      );

      showOverlay(
        "✕ CAMERA",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    if (
      scanResult.status ===
      "timeout"
    ) {
      setResult(
        "Scan Timeout"
      );

      showOverlay(
        "✕ QR",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    if (
      scanResult.status ===
      "failed"
    ) {
      setResult(
        "QR Scan Failed"
      );

      showOverlay(
        "✕ QR",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    // successであることを明示
    if (
      scanResult.status !==
      "success"
    ) {
      return;
    }

    const text =
      scanResult.text;

    if (tab === "eval") {
      setResult(text);

      showOverlay(
        "✓ OK",
        "#00ff00"
      );

      playSuccess();
      vibrateSuccess();

      return;
    }

    const applied =
      await applyProductionScan(
        text
      );

    if (!applied) {
      return;
    }

    setResult(text);
  };
  
  // OCR結果を画面とProductionへ反映
  const runOCR = async () => {
    const ocrResult =
      await runOCRFromCamera();

    if (
      ocrResult.status ===
      "camera-not-ready"
    ) {
      setResult(
        "Camera Not Ready"
      );

      showOverlay(
        "✕ CAMERA",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    if (
      ocrResult.status ===
      "ocr-not-ready"
    ) {
      setResult(
        "OCR Not Ready"
      );

      showOverlay(
        "✕ OCR",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    if (
      ocrResult.status ===
      "canvas-failed"
    ) {
      setResult(
        "Canvas Create Failed"
      );

      showOverlay(
        "✕ OCR",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    if (
      ocrResult.status ===
      "low-confidence"
    ) {
      const confidence =
        ocrResult.confidence ??
        0;

      setResult(
        `⚠ OCR Failed ` +
        `(${confidence.toFixed(0)}%)`
      );

      showOverlay(
        "✕ OCR",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    if (
      ocrResult.status ===
      "failed"
    ) {
      setResult(
        "⚠ OCR Failed"
      );

      showOverlay(
        "✕ OCR",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    // success以外ではtextを参照しない
    if (
      ocrResult.status !==
      "success"
    ) {
      return;
    }

    const {
      text,
      confidence,
      sourceCanvas,
      cropCanvas,
      cropX,
      cropY,
      cropW,
      cropH,
    } = ocrResult;

    // TEST MODE用の切り出し範囲表示
    const sourceCtx =
      sourceCanvas.getContext(
        "2d"
      );

    if (sourceCtx) {
      sourceCtx.strokeStyle =
        "red";

      sourceCtx.lineWidth = 5;

      sourceCtx.strokeRect(
        cropX,
        cropY,
        cropW,
        cropH
      );
    }

    sourceCanvas.style.width =
      "100%";

    sourceCanvas.style.maxWidth =
      "450px";

    sourceCanvas.style.border =
      "2px solid blue";

    document
      .getElementById(
        "debugFull"
      )
      ?.remove();

    sourceCanvas.id =
      "debugFull";

    cropCanvas.style.height =
      "auto";

    cropCanvas.style.objectFit =
      "contain";

    cropCanvas.style.width =
      "100%";

    cropCanvas.style.maxWidth =
      "450px";

    cropCanvas.style.border =
      "2px solid red";

    document
      .getElementById(
        "debugCanvas"
      )
      ?.remove();

    cropCanvas.id =
      "debugCanvas";

    if (tab === "eval") {
      document.body.appendChild(
        sourceCanvas
      );

      document.body.appendChild(
        cropCanvas
      );
    }

    const regex =
      items[currentIndex]
        ?.regex;

    if (regex?.trim()) {
      try {
        if (
          !new RegExp(
            regex
          ).test(text)
        ) {
          setResult(
            `Format Error : ${text}`
          );

          showOverlay(
            "✕ FORMAT",
            "#ff0000"
          );

          playError();
          vibrateError();

          return;
        }
      } catch (error) {
        console.error(
          "Invalid Regex:",
          regex,
          error
        );

        setResult(
          "Invalid Regex"
        );

        showOverlay(
          "✕ FORMAT",
          "#ff0000"
        );

        playError();
        vibrateError();

        return;
      }
    } else if (
      text.length === 0 ||
      !/^[0-9A-Z=]+$/.test(
        text
      )
    ) {
      setResult(
        "⚠ OCR Failed"
      );

      showOverlay(
        "✕ OCR",
        "#ff0000"
      );

      playError();
      vibrateError();

      return;
    }

    if (tab === "eval") {
      setResult(text);

      showOverlay(
        "✓ OK",
        "#00ff00"
      );

      playSuccess();
      vibrateSuccess();

      return;
    }

    const applied =
      await applyProductionScan(
        text
      );

    if (!applied) {
      return;
    }

    setResult(
      `OCR: ${text} ` +
      `(${confidence.toFixed(0)}%)`
    );
  };

  // Config QR送信を開始
  const sendConfig =
    async (): Promise<void> => {
      const sendResult =
        await startSendConfig(
          items,
          results
        );

      if (
        sendResult.status ===
        "failed"
      ) {
        setResult(
          "Send Config Failed"
        );

        playError();
        vibrateError();

        return;
      }

      setTestSheetOpen(true);

      setResult(
        `Sending Config: ` +
        `${sendResult.frameCount} Frames`
      );
    };

  // Config QR送信を停止
  const stopSendConfig =
    (): void => {
      stopSendConfigFromHook();

      // 送信用シートを閉じる
      setTestSheetOpen(false);
    };

  // Config QR受信を停止
  const stopReceiveConfig =
    (): void => {
      stopReceiveConfigFromHook();
    };

  // Hookで復元したConfigをAppへ反映
  const processReceiveFrame =
    async (
      text: string
    ): Promise<void> => {
      const receiveResult =
        await processReceiveFrameFromHook(
          text
        );

      if (
        receiveResult.status ===
          "ignored" ||
        receiveResult.status ===
          "receiving"
      ) {
        return;
      }

      if (
        receiveResult.status ===
        "failed"
      ) {
        setResult(
          `Received Config Failed: ` +
          receiveResult.message
        );

        showOverlay(
          "✕ CONFIG",
          "#ff0000"
        );

        playError();
        vibrateError();

        return;
      }

      if (
        receiveResult.status !==
        "completed"
      ) {
        return;
      }

      const {
        items:
          restoredItems,
        results:
          restoredResults,
        transferId:
          receivedTransferId,
        checksum,
      } =
        receiveResult.config;

      setItems(
        restoredItems
      );

      setResults(
        restoredResults
      );

      const startIndex =
        restoredItems.findIndex(
          isProductionInputItem
        );

      setCurrentIndex(
        startIndex >= 0
          ? startIndex
          : 0
      );

      await saveProductionRecord({
        configItems:
          restoredItems,

        ...restoredResults,

        updateTime:
          new Date()
            .toLocaleString(),

        transferId:
          receivedTransferId,

        checksum,
      });

      setResult(
        "Received Config Loaded"
      );

      showOverlay(
        "✓ CONFIG",
        "#00ff00"
      );

      playSuccess();
      vibrateSuccess();
    };


  // Config QR受信を開始
  const startReceiveConfig =
    async (): Promise<void> => {
      // Config受信時はスキャン範囲を60%に固定
      setScanWidth(60);
      setScanHeight(60);

      await startReceiveConfigFromHook({
        video:
          videoRef.current,

        // State更新前でも確実に60%を使う
        scanWidth: 60,
        scanHeight: 60,

        isMobile,
        cropTopRate,
        cropBottomRate,

        // 読み取ったFrameを検証・復元する
        onFrame:
          processReceiveFrame,
      });
    };

  const changeZoom = async (
    delta: number
  ) => {

    const track =
      trackRef.current;

    if (!track) return;

    try {

      const capabilities =
        track.getCapabilities() as any;

      if (!capabilities.zoom) {
        setResult("Zoom Not Supported");
        return;
      }

      const newZoom =
        Math.max(
          capabilities.zoom.min,
          Math.min(
            capabilities.zoom.max,
            zoom + delta
          )
        );

      await track.applyConstraints({
        advanced: [
          {
            zoom: newZoom,
          } as any,
        ],
      });

      setZoom(newZoom);

    } catch (err) {
      console.error(err);
    }
  };
    

  return (
    <div
      style={{
        padding: 15,
        touchAction: "manipulation",
      }}
    >

    <input
      type="file"
      accept=".xlsx"
      ref={fileInputRef}
      style={{ display: "none" }}
      onChange={loadConfig}
    />


    {/* モード切替タブ */}
    <ModeTabs
      onProduction={() => {
        document
          .getElementById("debugFull")
          ?.remove();

        document
          .getElementById("debugCanvas")
          ?.remove();

        setTab("prod");
      }}
      onTest={() => {
        setTab("eval");
        setSheetLevel(0);
      }}
    />

    {/* カメラプレビュー表示 */}
    <CameraPreview
      videoRef={videoRef}
      previewCanvasRef={previewCanvasRef}
      isMobile={isMobile}
      overlayMessage={overlayMessage}
      overlayColor={overlayColor}
      results={results}
      items={items}
      currentIndex={currentIndex}
      progressCount={progressCount}
      totalCount={totalCount}
      scanWidth={scanWidth}
      scanHeight={scanHeight}
      zoom={zoom}
      changeZoom={changeZoom}
      setScanWidth={setScanWidth}
      setScanHeight={setScanHeight}
      vibrateSuccess={vibrateSuccess}
    />


      <div
        style={{
          marginTop: "6px",
          fontSize: "12px",
          color: "#888",
          textAlign: "center",
        }}
      >
        Build: {BUILD_DATE} JST
      </div>
 
    {/* QR・バーコード／OCR読取ボタン */}
    <ScanButtons
      scanning={scanning}
      ocrLoading={ocrLoading}
      ocrReady={ocrReady}
      onScanQr={scanQr}
      onRunOCR={runOCR}
    />

    {tab === "eval" && (
    <>
      <br />
      <h2>Latest Scan</h2>
      <div
        style={{
          border: "1px solid #ccc",
          padding: "15px",
          marginBottom: "20px",
          fontSize: "20px",
        }}
      >
        {result}
      </div>
    </>
    )}

    {tab === "eval" && (
      <>
        {/* TESTモードのConfig送受信シート */}
        <TestConfigSheet
          configMode={configMode}
          testSheetOpen={testSheetOpen}
          qrImage={qrImage}
          currentFrame={currentFrame}
          sendFrameCount={sendFrames.length}
          transferId={transferId}
          receivedCount={receivedCount}
          receiveTotal={receiveTotal}
          receiveStatus={receiveStatus}
          onToggleSheet={() => {
            // TESTシートの開閉を切り替える
            setTestSheetOpen((prev) => !prev);
          }}
          onSendConfig={sendConfig}
          onReceiveConfig={startReceiveConfig}
          onStopSend={stopSendConfig}
          onStopReceive={stopReceiveConfig}
        />
      </>
    )}


    {tab === "prod" && (
    <>
      <div style={{ height: "10px" }} />


      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: "8px",
          padding: "10px",
        }}
      >

      {/* Productionの前・現在・次項目 */}
      <ProductionCurrentItem
        items={items}
        results={results}
        currentIndex={currentIndex}

        onPrevious={async () => {
          // 現在の入力内容を保存
          await saveCurrentProduction();

          // 1つ前の項目へ移動
          setCurrentIndex((prev) =>
            Math.max(0, prev - 1)
          );

          vibrateSuccess();
        }}

        onValueChange={(value) => {
          const itemName =
            items[currentIndex]?.name;

          if (!itemName) return;

          // 現在項目の入力結果を更新
          setResults({
            ...results,
            [itemName]: value,
          });
        }}

        onValueEnter={async (value) => {
          const itemName =
            items[currentIndex]?.name;

          if (!itemName) return;

          const newResults = {
            ...results,
            [itemName]: value,
          };

          // 入力結果を更新して保存
          setResults(newResults);

          await saveCurrentProduction(
            newResults
          );

          // 次の項目へ移動
          setCurrentIndex((prev) =>
            Math.min(
              items.length - 1,
              prev + 1
            )
          );

          playSuccess();
          vibrateSuccess();
        }}

        onNext={async () => {
          // 現在の入力内容を保存
          await saveCurrentProduction();

          // 1つ次の項目へ移動
          setCurrentIndex((prev) =>
            Math.min(
              items.length - 1,
              prev + 1
            )
          );

          vibrateSuccess();
        }}
      />
    </div>


    </>
    )}

    {/* Production下部シート */}
    {tab === "prod" && (
      <ProductionSheet
        sheetLevel={sheetLevel}
        items={items}
        results={results}
        currentIndex={currentIndex}

        onToggleSheet={() => {
          // 0 → 1 → 2 → 0の順にシート位置を変更
          setSheetLevel((prev) =>
            prev >= 2 ? 0 : prev + 1
          );
        }}

        onLoad={() => {
          // 通常クリックでConfigファイルを選択
          fileInputRef.current?.click();
        }}

        onLoadPointerDown={() => {
          // 1.5秒長押しでOneDriveから読み込む
          pressTimer.current =
            window.setTimeout(async () => {
              await loadFromOneDrive();
            }, 1500);
        }}

        onPointerEnd={() => {
          // 各ボタン・項目の長押し判定を解除
          if (pressTimer.current) {
            clearTimeout(pressTimer.current);
          }
        }}

        onExportClick={() => {
          // 長押し後に発生するクリックは処理しない
          if (
            exportLongPressTriggered.current
          ) {
            exportLongPressTriggered.current =
              false;

            return;
          }

          const now = Date.now();

          // 400ms以内のダブルクリックでQR付きExcel出力
          if (
            now -
              lastExportClick.current <
            400
          ) {
            exportProductionExcelWithQr();

            lastExportClick.current = 0;

            return;
          }

          lastExportClick.current = now;

          // シングルクリックで通常Excel出力
          setTimeout(() => {
            if (
              lastExportClick.current ===
              now
            ) {
              exportProductionExcel();
            }
          }, 400);
        }}

        onExportPointerDown={() => {
          exportLongPressTriggered.current =
            false;

          // 1.5秒長押しでCSV出力
          pressTimer.current =
            window.setTimeout(() => {
              exportLongPressTriggered.current =
                true;

              exportProductionCsv();
            }, 1500);
        }}

        onClearPointerDown={() => {
          // 1.5秒長押しでProduction DBを消去
          pressTimer.current =
            window.setTimeout(async () => {
              await clearProductionDB();
            }, 1500);
        }}

        onItemPointerDown={(index) => {
          // 1.5秒長押しで対象項目を選択
          pressTimer.current =
            window.setTimeout(() => {
              setCurrentIndex(index);
              setSheetLevel(0);

              playSuccess();
              vibrateSuccess();
            }, 1500);
        }}
      />
    )}


    </div>    

  );
}