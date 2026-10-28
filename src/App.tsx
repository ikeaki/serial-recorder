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

// Components -------
// prodicution / test tab
import { ModeTabs } from "./components/ModeTabs";

// CameraPreview
import { CameraPreview } from "./components/CameraPreview";

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

  // 解析結果をReact Stateへ反映
  const loadExcelConfig = async (
    arrayBuffer: ArrayBuffer
  ): Promise<void> => {
    const {
      items: loadedItems,
      results: loadedResults,
    } = parseExcelConfig(
      arrayBuffer
    );

    setItems(
      loadedItems
    );

    setResults(
      loadedResults
    );

    const startIndex =
      loadedItems.findIndex(
        isProductionInputItem
      );

    setCurrentIndex(
      startIndex >= 0
        ? startIndex
        : 0
    );
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

        
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "10px",
        }}
      >
        <button
          style={{
            flex: 1,
            height: "48px",
            fontSize: "16px",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          disabled={
            scanning ||
            ocrLoading
          }

          onClick={scanQr}
        >
          {scanning ? "Scanning..." : "Scan QR/Barcode"}
        </button>

        <button
          style={{
            flex: 1,
            height: "48px",
            fontSize: "16px",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          disabled={
          scanning ||
          ocrLoading ||
          !ocrReady
          }
          onClick={runOCR}
        >
          {ocrLoading
            ? "Scanning..."
            : "Scan OCR"}
        </button>
      </div>


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

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "10px",
        }}
      >
      </div>



    </>
    )}


{tab === "eval" && (
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
    {configMode !== "send" && (
      <div
        onClick={() =>
          setTestSheetOpen(
            prev => !prev
          )
        }
        style={{
          height: "40px",
          minHeight: "40px",

          display: "flex",
          justifyContent: "center",
          alignItems: "center",

          cursor: "pointer",
        }}
      >
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
        {configMode !== "send" && (
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexShrink: 0,
            }}
          >
            <button
              style={{
                flex: 1,
                height: "50px",
              }}
              onClick={sendConfig}
            >
              SEND CONFIG
            </button>

            <button
              style={{
                flex: 1,
                height: "50px",
              }}
              onClick={
                startReceiveConfig
              }
            >
              RECEIVE CONFIG
            </button>
          </div>
        )}

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
            Select Mode
          </div>
        )}

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
                Generating QR Code...
              </div>
            )}

            <div
              style={{
                marginTop: "4px",
                fontSize: "18px",
                fontWeight: "bold",
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              Frame{" "}
              {currentFrame + 1}
              {" / "}
              {sendFrames.length}
            </div>

            <button
              type="button"
              onClick={
                stopSendConfig
              }
              style={{
                marginTop: "8px",
                width: "160px",
                height: "44px",
                fontSize: "16px",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              STOP
            </button>
          </div>
        )}

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
            <div
              style={{
                fontSize: "18px",
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              {receiveStatus}
            </div>

            <div
              style={{
                marginTop: "4px",
                maxWidth: "90%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "11px",
                color: "#666",
              }}
            >
              ID: {transferId || "-"}
            </div>

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
                      ? `${
                          (
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

            <button
              type="button"
              onClick={
                stopReceiveConfig
              }
              style={{
                marginTop: "8px",
                width: "140px",
                height: "36px",
              }}
            >
              STOP
            </button>
          </div>
        )}
      </div>
    )}
  </div>
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

      <div>

          {/* Previous */}
          <div
            onClick={async () => {

              await saveCurrentProduction();

              setCurrentIndex(prev =>
                Math.max(0, prev - 1)
              );

              vibrateSuccess();
            }}

            style={{
              display: "grid",
              gridTemplateColumns: "120px 60px 1fr",
              alignItems: "center",
              textAlign: "left",
              gap: "10px",
              color: "#888",
              fontSize: "14px",
              height: "32px",
              marginBottom: "15px",
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
              touchAction: "manipulation",
            }}
          >
          <div>
            {items[currentIndex - 1]?.name ?? "-"}
          </div>

          <div>
            {items[currentIndex - 1]?.type ?? ""}
          </div>

          <div>
            {
              results[
                items[currentIndex - 1]?.name
              ] ?? ""
            }
          </div>
        </div>

        {/* Current */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 60px 1fr",
            alignItems: "center",
            height: "60px",
            gap: "10px",
            overflow: "hidden",
          }}
        >

        <div
          style={{
            height: "60px",

            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",

            fontSize: "24px",
            fontWeight: "bold",
            lineHeight: "1.1",

            overflow: "hidden",
            wordBreak: "break-word",

            textAlign: "left",            

          }}
        >
          {items[currentIndex]?.name ?? ""}
        </div>


          <div
            style={{
              fontSize: "20px",
              color: "#666",
              textAlign: "left",
            }}
          >
            {items[currentIndex]?.type ?? ""}
          </div>

          <input
            value={
              results[
                items[currentIndex]?.name
              ] ?? ""
            }

            onChange={async (e) => {

              const itemName =
                items[currentIndex]?.name;

              if (!itemName) return;


              const value = e.target.value;

              const newResults = {
                ...results,
                [itemName]: value,
              };

              setResults(newResults);

            }}   

            onKeyDown={async (e) => {

              if (e.key !== "Enter") return;

              const itemName =
                items[currentIndex]?.name;

              if (!itemName) return;

              const value =
                (e.target as HTMLInputElement)
                  .value
                  .trim();

              const newResults = {
                ...results,
                [itemName]: value,
              };

              setResults(newResults);

              await saveCurrentProduction(
                newResults
              );

              setCurrentIndex(prev =>
                Math.min(
                  items.length - 1,
                  prev + 1
                )
              );

              playSuccess();
              vibrateSuccess();

            }}

            style={{
              width: "100%",
              height: "50px",
              fontSize: "24px",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Next */}
        <div
          onClick={async () => {

            await saveCurrentProduction();

            setCurrentIndex(prev =>
              Math.min(items.length - 1, prev + 1)
            );

            vibrateSuccess();

          }}
          style={{
            display: "grid",
            gridTemplateColumns: "120px 60px 1fr",
            alignItems: "center",
            textAlign: "left",
            gap: "10px",
            color: "#888",
            fontSize: "14px",
            height: "32px",
            marginBottom: "15px",

            cursor: "pointer",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "manipulation",
          }}
        >

          <div>
            {items[currentIndex + 1]?.name ?? "-"}
          </div>

          <div>
            {items[currentIndex + 1]?.type ?? ""}
          </div>

          <div>
            {
              results[
                items[currentIndex + 1]?.name
              ] ?? ""
            }
          </div>
        </div>

      </div>
    </div>


    </>
    )}

    {tab === "prod" && (    
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,

          height: "100vh",

          background: "white",

          borderTopLeftRadius: "16px",
          borderTopRightRadius: "16px",

          transform:
            sheetLevel === 0
              ? "translateY(calc(100vh - 40px))"
              : sheetLevel === 1
              ? "translateY(60vh)"
              : "translateY(0)",

          transition: "0.3s",

          zIndex: 1000,

          boxShadow: "0 -2px 10px rgba(0,0,0,0.2)",

          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          onClick={() =>
            setSheetLevel(prev =>
              prev >= 2 ? 0 : prev + 1
            )
          }
          style={{
            height: "40px",

            display: "flex",
            justifyContent: "center",
            alignItems: "center",

            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "4px",
              borderRadius: "2px",
              background: "#999",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            padding: "10px",
          }}
        >

          {/* Top Buttons */}

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
          <button
            style={{
              flex: 1,
              height: "50px",
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}

            onClick={() => {
              fileInputRef.current?.click();
            }}

            onPointerDown={() => {
              pressTimer.current =
                window.setTimeout(async () => {

                  await loadFromOneDrive();

                }, 1500);
            }}

            onPointerUp={() => {
              if (pressTimer.current) {
                clearTimeout(pressTimer.current);
              }
            }}

            onPointerLeave={() => {
              if (pressTimer.current) {
                clearTimeout(pressTimer.current);
              }
            }}
          >
            LOAD
          </button>

          <button
            style={{
              flex: 1,
              height: "50px",
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}

            onClick={() => {

              if (exportLongPressTriggered.current) {
                exportLongPressTriggered.current = false;
                return;
              }

              const now = Date.now();

              if (
                now - lastExportClick.current < 400
              ) {
                exportProductionExcelWithQr();
                lastExportClick.current = 0;
                return;
              }

              lastExportClick.current = now;

              setTimeout(() => {
                if (
                  lastExportClick.current === now
                ) {
                  exportProductionExcel();
                }
              }, 400);
            }}

            onPointerDown={() => {

              exportLongPressTriggered.current = false;

              pressTimer.current =
                window.setTimeout(() => {

                  exportLongPressTriggered.current = true;

                  exportProductionCsv();

                }, 1500);

            }}

            onPointerUp={() => {
              if (pressTimer.current) {
                clearTimeout(
                  pressTimer.current
                );
              }
            }}

            onPointerLeave={() => {
              if (pressTimer.current) {
                clearTimeout(
                  pressTimer.current
                );
              }
            }}
          >
            EXPORT
          </button>

          <button
            style={{
              flex: 1,
              height: "50px",
              backgroundColor: "#ccc",
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onPointerDown={() => {
              pressTimer.current =
                window.setTimeout(
                  async () => {
                    await clearProductionDB();
                  },
                  1500
                );
            }}
            onPointerUp={() => {
              if (pressTimer.current) {
                clearTimeout(
                  pressTimer.current
                );
              }
            }}
            onPointerLeave={() => {
              if (pressTimer.current) {
                clearTimeout(
                  pressTimer.current
                );
              }
            }}
          >
            CLEAR
          </button>
        </div>


          {/* Item List */}

          <div
            style={{
              border: "1px solid #ccc",
              borderRadius: "8px",

              flex: 1,
              minHeight: 0,

              overflowY: "auto",
              padding: "10px",
            }}
          >

            {items.map((item, index) => {

              const completed =
                (results[item.name] ?? "") !== "";

              const current =
                index === currentIndex;

              return (

              <div
                key={item.name}

                onPointerDown={() => {
                  pressTimer.current = window.setTimeout(
                    () => {

                      setCurrentIndex(index);
                      setSheetLevel(0);

                      playSuccess();
                      vibrateSuccess();

                    },
                    1500
                  );
                }}

                onPointerUp={() => {
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                  }
                }}

                onPointerLeave={() => {
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                  }
                }}

                onPointerCancel={() => {
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                  }
                }}

                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "120px 60px 1fr",

                    gap: "10px",

                    padding: "10px",

                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",

                    cursor: "pointer",

                    borderBottom:
                      "1px solid #eee",

                    backgroundColor:
                      current
                        ? "#dbeafe"
                        : "white",

                    color:
                      completed
                        ? "#000"
                        : "#888",
                  }}
                >
                  <div>{item.name}</div>
                  <div>{item.type}</div>

                  <div
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {results[item.name] ?? ""}
                  </div>
                </div>
              );
            })}

          </div>  
          </div>

        </div>
      )}


    </div>    

  );
}