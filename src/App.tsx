import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import * as XLSX from "xlsx";
import { createWorker } from "tesseract.js";
import ExcelJS from "exceljs";
import QRCode from "qrcode";

const DB_NAME = "serial-db";

const PROD_STORE_NAME = "production";
const BUILD_DATE = __BUILD_DATE__;


type ScanItem = {
  name: string;
  type?: string;
  value?: string;
  regex?: string;
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<any>(null);
  const [ocrReady, setOcrReady] = useState(false);
  const [result, setResult] = useState("Not Scanned");
  const [scanning, setScanning] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [scanHeight, setScanHeight] = useState(30);
  const [scanWidth, setScanWidth] = useState(50);
  const [tab, setTab] = useState<"eval" | "prod">("prod");
  const [sheetLevel, setSheetLevel] = useState(0);
  const [testSheetOpen, setTestSheetOpen] =
    useState(false);

  const [configMode, setConfigMode] =
    useState<"none" | "send" | "receive">(
      "none"
    );
    
  const [sendFrames, setSendFrames] =
  useState<string[]>([]);

  const [currentFrame, setCurrentFrame] =
    useState(0);

  const [qrImage, setQrImage] =
    useState("");


  const receiveFrames =
  useRef<Map<number, string>>(
    new Map()
  );

  const receiveRunningRef =
    useRef(false);

  const receiveReaderRef =
    useRef<BrowserMultiFormatReader | null>(
      null
    );

  const [receivedCount, setReceivedCount] =
    useState(0);

  const [receiveTotal, setReceiveTotal] =
    useState(0);

  const [receiveStatus, setReceiveStatus] =
    useState("Waiting...");

  const receiveTransferIdRef =
  useRef("");

  const receiveChecksumRef =
    useRef("");

  const receiveExpectedTotalRef =
    useRef(0);

  const [transferId, setTransferId] =
    useState("");

  const [results, setResults] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScanItem[]>([]);

  const lastExportClick = useRef(0);

  const [currentIndex, setCurrentIndex] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [zoom, setZoom] = useState(1);
  const cropTopRate = 0.2;
  const cropBottomRate = 0.2;
  const isMobile = window.innerWidth <= 768;
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pressTimer = useRef<number | null>(null);

  const exportLongPressTriggered = useRef(false);

  const [overlayMessage, setOverlayMessage] = useState("");

  const [overlayColor, setOverlayColor] = useState("#00ff00");
  const lastBeepRef = useRef(0);
  const lastErrorBeepRef = useRef(0);


  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 4);

      request.onupgradeneeded = () => {

        const db = request.result;

        if (
          !db.objectStoreNames.contains(
            PROD_STORE_NAME
          )
        ) {
          db.createObjectStore(
            PROD_STORE_NAME,
            {
              keyPath: "id",
              autoIncrement: true,
            }
          );
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  };

  const saveProductionRecord = async (
    data: any
  ) => {

    const db = await openDB();

    const tx =
      db.transaction(
        PROD_STORE_NAME,
        "readwrite"
      );

    const store =
      tx.objectStore(
        PROD_STORE_NAME
      );

    await new Promise<void>(
      (resolve, reject) => {

        const clearReq =
          store.clear();

        clearReq.onsuccess = () => {

          const addReq = store.add(data);

          addReq.onsuccess = () => {
            resolve();
          };

          addReq.onerror = () => {
            reject(addReq.error);
          };
        };

        clearReq.onerror =
          () => reject(clearReq.error);

      }
    );

  };
  

  const loadProductionHistory =
    async () => {

    const db = await openDB();

    const tx =
      db.transaction(
        PROD_STORE_NAME,
        "readonly"
      );

    const request =
      tx
        .objectStore(
          PROD_STORE_NAME
        )
        .getAll();

    return await new Promise<any[]>(
      (resolve, reject) => {

        request.onsuccess =
          () => resolve(request.result);

        request.onerror =
          () => reject(request.error);

      }
    );
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

            const nextIndex =
              configItems.findIndex(
                (item: ScanItem) =>
                  ![
                    "ConfigURL",
                    "Export Time",
                    "Model",
                  ].includes(item.name) &&
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

    const db = await openDB();

    const tx =
      db.transaction(
        PROD_STORE_NAME,
        "readwrite"
      );

    tx.objectStore(
      PROD_STORE_NAME
    ).clear();

    // UIもクリア
    setResults({});
    const startIndex =
      items.findIndex(
        item =>
          ![
            "ConfigURL",
            "Export Time",
            "Model",
          ].includes(item.name)
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


  const exportProductionExcel =
    async () => {

    const data =
      await loadProductionHistory();

    const latest =
      data.length > 0
        ? data[data.length - 1]
        : {};

    const { id, ...record } = latest;

    const exportData = [
      ["Name", "Type", "Regex", "Value"],

      ...items.map(item => [

          item.name,
          item.type ?? "",
          item.regex ?? "",
          item.name === "Export Time"
            ? new Date().toLocaleString()
            : (record[item.name] ?? ""),
      ]),
    ];

    const worksheet =
      XLSX.utils.aoa_to_sheet(
        exportData
      );

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Production"
    );

    const now = new Date();

    const model =
      (results["Model"] ?? "Production")
        .replace(/[\\/:*?"<>|]/g, "_");

    const fileName =
      `${model}-${
        now.getFullYear()
      }${
        String(now.getMonth() + 1).padStart(2, "0")
      }${
        String(now.getDate()).padStart(2, "0")
      }-${
        String(now.getHours()).padStart(2, "0")
      }${
        String(now.getMinutes()).padStart(2, "0")
      }.xlsx`;

      XLSX.writeFile(
        workbook,
        fileName
      );

    };
  
  const exportProductionExcelWithQr = async () => {

    const workbook = new ExcelJS.Workbook();

    const sheet =
      workbook.addWorksheet("Production");

    sheet.columns = [
      {
        header: "Name",
        key: "name",
        width: 25,
      },
      {
        header: "Type",
        key: "type",
        width: 10,
      },
      {
        header: "Regex",
        key: "regex",
        width: 35,
      },
      {
        header: "Value",
        key: "value",
        width: 35,
      },
      {
        header: "QR",
        key: "qr",
        width: 15,
      },
    ];

    for (let i = 0; i < items.length; i++) {

      const item = items[i];

      const value =
        item.name === "Export Time"
          ? new Date().toLocaleString()
          : (results[item.name] ?? "");

      sheet.addRow([
        item.name,
        item.type ?? "",
        item.regex ?? "",
        value,
        "",
      ]);

      const row = sheet.getRow(i + 2);
      row.height = 65;

      if (!String(value).trim()) {
        continue;
      }

      try {

        const qrBase64 =
          await QRCode.toDataURL(
            String(value),
            {
              margin: 1,
              width: 300,
            }
          );

        const imageId =
          workbook.addImage({
            base64: qrBase64,
            extension: "png",
          });

        sheet.addImage(imageId, {
          tl: {
            col: 4,
            row: i + 1,
          },
          ext: {
            width: 60,
            height: 60,
          },
        });

      } catch (err) {

        console.error(
          "QR Create Error:",
          value,
          err
        );

      }
    }

    sheet.getRow(1).font = {
      bold: true,
    };

    const buffer =
      await workbook.xlsx.writeBuffer();

    const blob = new Blob(
      [buffer],
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
    );

    const now = new Date();

    const model =
      (results["Model"] ?? "Production")
        .replace(/[\\/:*?"<>|]/g, "_");

    const fileName =
      `${model}-QR-${
        now.getFullYear()
      }${
        String(now.getMonth() + 1).padStart(2, "0")
      }${
        String(now.getDate()).padStart(2, "0")
      }-${
        String(now.getHours()).padStart(2, "0")
      }${
        String(now.getMinutes()).padStart(2, "0")
      }.xlsx`;

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;
    a.download = fileName;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    playSuccess();
    vibrateSuccess();
  };

  const exportProductionCsv =
    async () => {

      const data =
        await loadProductionHistory();

      const latest =
        data.length > 0
          ? data[data.length - 1]
          : {};

      const { id, ...record } = latest;

      const csvRows = [
        ["Name", "Type", "Regex", "Value"],

        ...items.map(item => [
            item.name,
            item.type ?? "",
            item.regex ?? "",
            item.name === "Export Time"
              ? new Date().toLocaleString()
              : (record[item.name] ?? ""),
        ]),
      ];

      const csvText = csvRows
        .map(row =>
          row.map(v =>
            `"${String(v).replace(/"/g, '""')}"`
          ).join(",")
        )
        .join("\r\n");

      const now = new Date();

      const model =
        (results["Model"] ?? "Production")
          .replace(/[\\/:*?"<>|]/g, "_");

      const fileName =
        `${model}-${
          now.getFullYear()
        }${
          String(now.getMonth() + 1).padStart(2, "0")
        }${
          String(now.getDate()).padStart(2, "0")
        }-${
          String(now.getHours()).padStart(2, "0")
        }${
          String(now.getMinutes()).padStart(2, "0")
        }.csv`;

      const blob = new Blob(
        ["\uFEFF" + csvText],
        {
          type: "text/csv;charset=utf-8;",
        }
      );

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement("a");

      a.href = url;
      a.download = fileName;

      playSuccess();
      vibrateSuccess();

      a.click();

      URL.revokeObjectURL(url);
  };

  const loadExcelConfig = async (
    arrayBuffer: ArrayBuffer
  ) => {

    const workbook =
      XLSX.read(
        arrayBuffer,
        { type: "array" }
      );

    const sheet =
      workbook.Sheets[
        workbook.SheetNames[0]
      ];

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        { header: 1 }
      ) as any[][];


    const headerRowIndex =
      rows.findIndex(
        row =>
          row[0] === "Name" &&
          row[1] === "Type"
      );

    if (headerRowIndex === -1) {
      throw new Error(
        "Invalid Config Format"
      );
    }

    const items =
      rows
        .slice(headerRowIndex + 1)
        .filter(row => row[0])
        .map(row => ({
          name: String(row[0]),
          type: String(row[1] ?? ""),
          regex: String(row[2] ?? ""),
          value: String(row[3] ?? ""),
    }));

    const defaultResults =
      Object.fromEntries(
        items.map(item => [
          item.name,
          item.value ?? "",
        ])
      );

    setItems(items);
    setResults(defaultResults);
    const startIndex =
      items.findIndex(
        item =>
          ![
            "ConfigURL",
            "Export Time",
            "Model",
          ].includes(item.name)
      );

    setCurrentIndex(startIndex);

    await saveProductionRecord({
    configItems: items,
    ...defaultResults,
    updateTime: new Date().toLocaleString(),
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

  const progressCount = items.filter(
    item =>
      ![
        "Model",
        "ConfigURL",
        "Export Time",
      ].includes(item.name)
       &&
      (results[item.name] ?? "").trim() !== ""
  ).length;

  const totalCount = items.filter(
    item =>
    ![
      "Model",
      "ConfigURL",
      "Export Time",
    ].includes(item.name)
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

  const getAudioContext = () => {

    if (!audioContextRef.current) {

      audioContextRef.current =
        new AudioContext();

    }

    return audioContextRef.current;
  };

  useEffect(() => {

    async function initOCR() {

      const worker =
        await createWorker("eng");

      workerRef.current = worker;

      setOcrReady(true);
    }

    initOCR();

    return () => {
      workerRef.current?.terminate();
    };

  }, []);
  
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

          const drawHeight =
            drawCameraFrame(
              ctx,
              canvas,
              video
            );

          const {
            cropX,
            cropY,
            cropW,
            cropH,
          } = getScanAreaWH(
            canvas.width,
            drawHeight
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

  useEffect(() => {

    if (
      configMode !== "send" ||
      sendFrames.length === 0
    ) {
      return;
    }

    const timer = setInterval(() => {

      setCurrentFrame(prev =>
        (prev + 1) %
        sendFrames.length
      );

    }, 200);

    return () =>
      clearInterval(timer);

  }, [
    configMode,
    sendFrames
  ]);

  useEffect(() => {

    if (
      configMode !== "send" ||
      sendFrames.length === 0
    ) {
      return;
    }

    QRCode.toDataURL(
      sendFrames[currentFrame]
    ).then(setQrImage);

  }, [
    configMode,
    currentFrame,
    sendFrames
  ]);  
  
  const scanQr = async () => {
    if (scanning) {
      return;
    }
    setScanning(true);

    const reader = new BrowserMultiFormatReader();
    
    try {

      const canvas =
        document.createElement("canvas");

      canvas.width =
        videoRef.current!.videoWidth;

      canvas.height =
        videoRef.current!.videoHeight;

      const ctx =
        canvas.getContext("2d");

      if (!ctx) return;

      const drawHeight =
        drawCameraFrame(
          ctx,
          canvas,
          videoRef.current!
        );

      const {
        cropX,
        cropY,
        cropW,
        cropH,
      } = getScanAreaWH(
        canvas.width,
        drawHeight
      );

      const cropCanvas =
        document.createElement("canvas");

      cropCanvas.width = cropW * 2;
      cropCanvas.height = cropH * 2;

      const cropCtx =
        cropCanvas.getContext("2d");

      if (!cropCtx) return;

      cropCtx.drawImage(
        canvas,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        cropW * 2,
        cropH * 2
      );


      const image =
        cropCanvas.toDataURL("image/png");

      const img =
        document.createElement("img");

      img.src = image;

      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });
      
    const resultPromise =
    reader.decodeFromImageElement(img);

      const timeoutPromise =
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("timeout")),
            2000
          )
        );

      const result = await Promise.race([
        resultPromise,
        timeoutPromise,
      ])as Awaited<typeof resultPromise>;
      
      const text = result.getText().trim();


      if (tab === "eval") {
        showOverlay("✓ OK", "#00ff00");
        setResult(text);
        playSuccess();
        vibrateSuccess();
        return;
      }

      if (
        tab === "prod" &&
        Object.values(results).includes(text)
      ) {

        playError();
        vibrateError();

        showOverlay("✕ DUP", "#ff0000");

        setResult(
          "⚠ Duplicate In Current Unit"
        );

        return;
      }

      if (
        tab === "prod" &&
        items[currentIndex]
      ) {

        const itemName =
          items[currentIndex].name;

        const newResults = {
          ...results,
          [itemName]: text,
        };

        setResults(newResults);
        
        await saveProductionRecord({
          configItems: items,
          ...newResults,
          updateTime:
            new Date().toLocaleString(),
        });

        setCurrentIndex(prev =>
          Math.min(
            prev + 1,
            items.length - 1
          )
        );
      }

      showOverlay("✓ OK", "#00ff00");
      playSuccess();
      vibrateSuccess();

      
      } catch (err) {

        if (
          err instanceof Error &&
          err.message === "timeout"
        ) {

          showOverlay(
            "✕ QR",
            "#ff0000"
          );

          playError();
          vibrateError();

          setResult("Scan Timeout");

          return;
        }

        console.error(err);

        showOverlay(
          "✕ QR",
          "#ff0000"
        );

        playError();
        vibrateError();

        setResult("QR Not Found");

      }

    finally {
      setScanning(false);
    }
  };
  
  const runOCR = async () => {

    if (!videoRef.current) return;

    setOcrLoading(true);

    try {

      const canvas =
        document.createElement("canvas");

      canvas.width =
        videoRef.current.videoWidth;

      canvas.height =
        videoRef.current.videoHeight;


      const ctx =
        canvas.getContext("2d");

      if (!ctx) return;

      const drawHeight =
        drawCameraFrame(
        ctx,
        canvas,
        videoRef.current
        );

      const {
        cropX,
        cropY,
        cropW,
        cropH,
      } = getScanAreaWH(
        canvas.width,
        drawHeight
      );

      ctx.strokeStyle = "red";
      ctx.lineWidth = 5;
      
      ctx.strokeRect(
        cropX,
        cropY,
        cropW,
        cropH,
      );
      
      canvas.style.width = "100%";
      canvas.style.maxWidth = "450px";
      canvas.style.border = "2px solid blue";

      document.getElementById("debugFull")?.remove();
      canvas.id = "debugFull";

      if (tab === "eval") {
        document.body.appendChild(canvas);
      }
      const cropCanvas =
        document.createElement("canvas");

      cropCanvas.width = cropW * 4;
      cropCanvas.height = cropH * 4;

      console.log({
        cropW,
        cropH,
        canvasW: cropCanvas.width,
        canvasH: cropCanvas.height,
      });


      const cropCtx =
        cropCanvas.getContext("2d");

      if (!cropCtx) return;

      cropCtx.drawImage(
        canvas,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        cropW * 4,
        cropH * 4
      );

      const thresholds = [
        120,
        140,
        160,
        180,
        200,
      ];

      let bestText = "";
      let bestConfidence = 0;


      for (const threshold of thresholds) {

        const workCanvas =
          document.createElement("canvas");

        workCanvas.width =
          cropCanvas.width;

        workCanvas.height =
          cropCanvas.height;

        const workCtx =
          workCanvas.getContext("2d");

        if (!workCtx) continue;

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
          await workerRef.current.recognize(
            image,
            "eng",
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
        confidence > bestConfidence
        ) {
        bestConfidence = confidence;
        bestText = text;
        }



        console.log(
          "OCR threshold:",
          threshold
          );

      }
      
      if (bestConfidence < 50) {
        showOverlay("✕ OCR", "#ff0000");
        playError();
        vibrateError();
        setResult(
        `⚠ OCR Failed (${bestConfidence.toFixed(0)}%)`
        );
        return;
      }

      const rawText = bestText;
      
      const text = rawText;

        
      console.log({
      rawText,
      text,
      bestConfidence,
      });
    

      cropCanvas.id = "debugCanvas";

      document
        .getElementById("debugCanvas")
        ?.remove();

      cropCanvas.style.height = "auto";
      cropCanvas.style.objectFit = "contain";
      cropCanvas.style.width = "100%";
      cropCanvas.style.maxWidth = "450px";
      cropCanvas.style.border = "2px solid red";

      if (tab === "eval") {
        document.body.appendChild(cropCanvas);
      }

      const regex =
        items[currentIndex]?.regex;

      if (regex?.trim()) {

        // Regex指定あり
        if (!new RegExp(regex).test(text)) {

          playError();
          vibrateError();

          showOverlay("✕ FORMAT", "#ff0000");

          setResult(
            `Format Error : ${text}`
          );

          return;
        }

      } else {

        // Regex未指定
        if (
          text.length === 0 ||
          !/^[0-9A-Z=]+$/.test(text)
        ) {

          showOverlay("✕ OCR", "#ff0000");

          playError();
          vibrateError();

          setResult("⚠ OCR Failed");

          return;
        }

      }

      if (tab === "eval") {
        setResult(text);
        showOverlay("✓ OK", "#00ff00");
        playSuccess();
        vibrateSuccess();
        return;
      }

      if (
        tab === "prod" &&
        Object.values(results).includes(text)
      ) {

        playError();
        vibrateError();

        showOverlay("✕ DUP", "#ff0000");

        setResult(
          "⚠ Duplicate In Current Unit"
        );

        return;
      }

      showOverlay("✓ OK", "#00ff00");

      playSuccess();
      vibrateSuccess();

      if (
        tab === "prod" &&
        items[currentIndex]
      ) {

        const itemName =
          items[currentIndex].name;

        const newResults = {
          ...results,
          [itemName]: text,
        };

        setResults(newResults);
        
        await saveProductionRecord({
          configItems: items,
          ...newResults,
          updateTime:
            new Date().toLocaleString(),
        });

        setCurrentIndex(prev =>
          Math.min(
            prev + 1,
            items.length - 1
          )
        );
      }


      setResult(
        `OCR: ${text} (${bestConfidence.toFixed(0)}%)`
      );

    } finally {

      setOcrLoading(false);

    }
  };

  const sendConfig = async () => {
    try {
      const configData =
        items.map(item => ({
          n: item.name,
          t: item.type ?? "",
          r: item.regex ?? "",
          v:
            results[item.name] ??
            item.value ??
            "",
        }));

      const json =
        JSON.stringify(configData);

      const bytes =
        new TextEncoder().encode(json);

      let binary = "";

      for (
        let i = 0;
        i < bytes.length;
        i++
      ) {
        binary +=
          String.fromCharCode(
            bytes[i]
          );
      }

      const base64 =
        btoa(binary);

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

      const frameSize = 600;
      const frames: string[] = [];

      const total =
        Math.ceil(
          base64.length /
            frameSize
        );

      for (
        let i = 0;
        i < total;
        i++
      ) {
        const chunk =
          base64.slice(
            i * frameSize,
            (i + 1) *
              frameSize
          );

        frames.push(
          [
            "CFGJ",
            newTransferId,
            String(i + 1)
              .padStart(4, "0"),
            String(total)
              .padStart(4, "0"),
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
      setTestSheetOpen(true);

      setResult(
        `Sending Config: ${frames.length} Frames`
      );
    } catch (err) {
      console.error(
        "Send Config Error:",
        err
      );

      setResult(
        "Send Config Failed"
      );

      setConfigMode("none");

      playError();
      vibrateError();
    }
  };

  const stopSendConfig = () => {
    setConfigMode("none");
    setSendFrames([]);
    setCurrentFrame(0);
    setQrImage("");
    setTestSheetOpen(false);
  }; 

  const calculateChecksum = async (
    value: string
  ) => {
    const data =
      new TextEncoder().encode(value);

    const hashBuffer =
      await crypto.subtle.digest(
        "SHA-256",
        data
      );

    return Array.from(
      new Uint8Array(hashBuffer)
    )
      .map(byte =>
        byte
          .toString(16)
          .padStart(2, "0")
      )
      .join("");
  };


  const stopReceiveConfig =
    () => {
      receiveRunningRef.current =
        false;

      receiveReaderRef.current =
        null;

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
      setConfigMode("none");
      setReceiveStatus("Stopped");
    };

const processReceiveFrame =
  async (
    text: string
  ) => {
    if (
      !text.startsWith(
        "CFGJ|"
      )
    ) {
      return;
    }

    const parts =
      text.split("|");

    if (
      parts.length !== 6
    ) {
      return;
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
      return;
    }

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

    if (
      receiveTransferIdRef
        .current !==
      receivedTransferId
    ) {
      return;
    }

    if (
      receiveChecksumRef
        .current !==
      checksum
    ) {
      return;
    }

    if (
      receiveExpectedTotalRef
        .current !==
      total
    ) {
      return;
    }

    if (
      receiveFrames.current.has(
        index
      )
    ) {
      return;
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
      return;
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
          receiveFrames.current.get(
            frame
          );

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

      const binary =
        atob(base64);

      const bytes =
        new Uint8Array(
          binary.length
        );

      for (
        let i = 0;
        i <
        binary.length;
        i++
      ) {
        bytes[i] =
          binary.charCodeAt(
            i
          );
      }

      const json =
        new TextDecoder()
          .decode(bytes);

      const receivedConfig =
        JSON.parse(
          json
        ) as Array<{
          n: string;
          t?: string;
          r?: string;
          v?: string;
        }>;

      const restoredItems:
        ScanItem[] =
          receivedConfig.map(
            item => ({
              name: item.n,
              type:
                item.t ?? "",
              regex:
                item.r ?? "",
              value:
                item.v ?? "",
            })
          );

      const restoredResults:
        Record<
          string,
          string
        > =
          Object.fromEntries(
            restoredItems.map(
              item => [
                item.name,
                item.value ??
                  "",
              ]
            )
          );

      setItems(
        restoredItems
      );

      setResults(
        restoredResults
      );

      const startIndex =
        restoredItems.findIndex(
          item =>
            ![
              "ConfigURL",
              "Export Time",
              "Model",
            ].includes(
              item.name
            )
        );

      setCurrentIndex(
        startIndex >= 0
          ? startIndex
          : 0
      );

      await saveProductionRecord(
        {
          configItems:
            restoredItems,

          ...restoredResults,

          updateTime:
            new Date()
              .toLocaleString(),

          transferId:
            receivedTransferId,

          checksum,
        }
      );

      setReceiveStatus(
        "Checksum OK / Config Loaded"
      );

      setResult(
        "Received Config Loaded"
      );

      showOverlay(
        "✓ CONFIG",
        "#00ff00"
      );

      playSuccess();
      vibrateSuccess();
    } catch (err) {
      console.error(
        "Config Restore Error:",
        err
      );

      const message =
        err instanceof Error
          ? err.message
          : "Restore Failed";

      setReceiveStatus(
        message
      );

      setResult(
        `Received Config Failed: ${message}`
      );

      showOverlay(
        "✕ CONFIG",
        "#ff0000"
      );

      playError();
      vibrateError();
    }
  };


  const startReceiveConfig = async () => {
    if (
      !videoRef.current ||
      !previewCanvasRef.current
    ) {
      setReceiveStatus(
        "Camera Not Ready"
      );

      return;
    }

    setScanWidth(60);
    setScanHeight(60);

    receiveRunningRef.current = false;

    receiveFrames.current.clear();

    receiveTransferIdRef.current = "";
    receiveChecksumRef.current = "";
    receiveExpectedTotalRef.current = 0;

    setTransferId("");
    setReceivedCount(0);
    setReceiveTotal(0);
    setReceiveStatus("Waiting...");

    setConfigMode("receive");

    receiveRunningRef.current = true;


    receiveRunningRef.current = true;

    const reader =
      new BrowserMultiFormatReader();

    receiveReaderRef.current =
      reader;

    const scanLoop = async () => {
      if (
        !receiveRunningRef.current
      ) {
        return;
      }

      const video =
        videoRef.current;

      if (
        !video ||
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
        const canvas =
          document.createElement(
            "canvas"
          );

        canvas.width =
          video.videoWidth;

        canvas.height =
          video.videoHeight;

        const ctx =
          canvas.getContext("2d");

        if (!ctx) {
          window.setTimeout(
            scanLoop,
            200
          );

          return;
        }

        const drawHeight =
          drawCameraFrame(
            ctx,
            canvas,
            video
          );

        const {
          cropX,
          cropY,
          cropW,
          cropH,
        } = getScanAreaWH(
          canvas.width,
          drawHeight
        );

        const cropCanvas =
          document.createElement(
            "canvas"
          );

        cropCanvas.width =
          Math.round(cropW * 2);

        cropCanvas.height =
          Math.round(cropH * 2);

        const cropCtx =
          cropCanvas.getContext("2d");

        if (!cropCtx) {
          window.setTimeout(
            scanLoop,
            200
          );

          return;
        }

        cropCtx.drawImage(
          canvas,
          cropX,
          cropY,
          cropW,
          cropH,
          0,
          0,
          cropCanvas.width,
          cropCanvas.height
        );

        const image =
          cropCanvas.toDataURL(
            "image/png"
          );

        const img =
          document.createElement("img");

        img.src = image;

        await new Promise<void>(
          (resolve, reject) => {
            img.onload =
              () => resolve();

            img.onerror =
              () => reject(
                new Error(
                  "Image Load Failed"
                )
              );
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

        await processReceiveFrame(
          text
        );
      } catch {
        // QRが読めないFrameは無視
      }

      if (
        receiveRunningRef.current
      ) {
        window.setTimeout(
          scanLoop,
          200
        );
      }
    };

    scanLoop();
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
    
  const playSuccess = () => {

    const now = Date.now();

    if (
      now - lastBeepRef.current < 200
    ) {
      return;
    }

    lastBeepRef.current = now;

    const audioContext =
      getAudioContext();

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 1200;

    gain.gain.value = 0.3;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime + 0.1
    );
  };

  const playError = () => {

    const now = Date.now();

    if (
      now - lastErrorBeepRef.current < 200
    ) {
      return;
    }

    lastErrorBeepRef.current = now;

    const audioContext =
      getAudioContext();

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.value = 300;

    gain.gain.value = 0.1;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime + 0.15
    );
  };

  const vibrateSuccess = () => {
    if ("vibrate" in navigator) {
      navigator.vibrate(100);
    }
  };

  const vibrateError = () => {
    if ("vibrate" in navigator) {
      navigator.vibrate([400,100,100]);
    }
  };
  
  const drawCameraFrame = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ) => {

    if (isMobile) {

      const srcY =
        video.videoHeight * cropTopRate;

      const srcH =
        video.videoHeight *
        (1 - cropTopRate - cropBottomRate);

      const drawHeight =
        canvas.width *
        (srcH / video.videoWidth);

      canvas.height = drawHeight;

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

  const getScanAreaWH = (
    width: number,
    height: number
  ) => {

    const cropW =
      width *
      (scanWidth / 100);

    const cropH =
      height *
      (scanHeight / 100);

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


    <div
      style={{
        display: "flex",
        marginBottom: "10px",
        userSelect: "none",
        WebkitUserSelect: "none",

      }}
    >
      <button
        style={{
          flex: 1,
          height: "36px",
        }}
        onClick={() => {

          document
            .getElementById("debugFull")
            ?.remove();

          document
            .getElementById("debugCanvas")
            ?.remove();

          setTab("prod");
        }}
      >
        PRODUCTION MODE
      </button>

      <button
        style={{
          flex: 1,
          height: "36px",
        }}
        onClick={() => {
          setTab("eval");
          setSheetLevel(0);
        }}
      >
        TEST MODE
      </button>


    </div>

    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: isMobile
        ? "320px"
        : "450px",
        margin: "0 auto",
        overflow: "visible",
        borderRadius: "8px",

        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        
        touchAction: "manipulation",        

      }}
      >

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
        position: "absolute",
        left: "-9999px",
        width: "1px",
        height: "1px"
        }}
      />

      <canvas
        ref={previewCanvasRef}
        onContextMenu={(e) => e.preventDefault()}

        onClick={(e) => {

          const rect =
            e.currentTarget.getBoundingClientRect();

          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          const w = rect.width;
          const h = rect.height;

          const {
            cropX,
            cropY,
            cropW,
            cropH,
          } = getScanAreaWH(w, h);

        // 左上 → Zoom +
        if (
          x < cropX &&
          y < cropY
        ) {

          changeZoom(0.5);
          vibrateSuccess();
          return;

        }

        // 左下 → Zoom -
        if (
          x < cropX &&
          y > cropY + cropH
        ) {

          changeZoom(-0.5);
          vibrateSuccess();
          return;

        }

        // 上 → Height +
        if (
          x >= cropX &&
          x <= cropX + cropW &&
          y < cropY
        ) {

          setScanHeight(prev =>
            Math.min(60, prev + 5)
          );

          vibrateSuccess();
        }

        // 下 → Height -
        else if (
          x >= cropX &&
          x <= cropX + cropW &&
          y > cropY + cropH
        ) {

          setScanHeight(prev =>
            Math.max(5, prev - 5)
          );

          vibrateSuccess();
        }

        // 左 → Width +
        else if (
          x < cropX &&
          y >= cropY &&
          y <= cropY + cropH
        ) {

          setScanWidth(prev =>
            Math.min(90, prev + 5)
          );

          vibrateSuccess();
        }

        // 右 → Width -
        else if (
          x > cropX + cropW &&
          y >= cropY &&
          y <= cropY + cropH
        ) {

          setScanWidth(prev =>
            Math.max(20, prev - 5)
          );

          vibrateSuccess();
        }

        }}

        style={{
          width: "100%",
          height: "auto",
          display: "block",
          cursor: "pointer",

          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          WebkitTapHighlightColor: "transparent",
          
          touchAction: "manipulation",          

        }}
      />

      {
        overlayMessage && (
          <div
            style={{
              position: "absolute",

              left: "50%",
              top: "50%",

              transform:
                "translate(-50%, -50%)",

              color: overlayColor,

              fontSize: "48px",
              fontWeight: "bold",

              textShadow:
                "2px 2px 4px black",

              pointerEvents: "none",

              zIndex: 999,
            }}
          >
            {overlayMessage}
          </div>
        )
      }

      <div
        style={{
          position: "absolute",
          top: "0px",
          left: "6px",

          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",

          gap: "6px",

          color: "white",
          fontSize: "12px",
          fontWeight: "bold",

          width: "calc(100% - 12px)",

          overflow: "hidden",
          whiteSpace: "nowrap",

          textAlign: "left",

          textShadow:
            "1px 1px 2px black, -1px -1px 2px black",

          pointerEvents: "none",
        }}
      >
        <span>
          {results["Model"] ?? "-"}
        </span>

        <span>｜</span>

        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            minWidth: 0,
          }}
        >
          {items[currentIndex]?.name ?? "-"}
        </span>

        <span>｜</span>

        <span>
          {items[currentIndex]?.type ?? "-"}
        </span>

        <span>｜</span>

        <span>
          {progressCount}/{totalCount}
        </span>
      </div>


      {/* 左下 REGEX等 */}
      <div
        style={{
          position: "absolute",
          left: "6px",
          bottom: "0px",

          color: "white",
          fontSize: "12px",
          fontWeight: "bold",

          textShadow:
            "1px 1px 2px black, -1px -1px 2px black",

          pointerEvents: "none",
        }}
      >
        {`RGX: ${items[currentIndex]?.regex || "OFF"}`}
      </div>

      {/* 右下 Zoom等 */}
      <div
        style={{
          position: "absolute",
          right: "6px",
          bottom: "0px",

          color: "white",
          fontSize: "12px",
          fontWeight: "bold",

          textShadow:
            "1px 1px 2px black, -1px -1px 2px black",

          pointerEvents: "none",
        }}
      >
        {`H:${scanHeight}% W:${scanWidth}% Z:${zoom.toFixed(1)}x`}
      </div>

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

      <div
        style={{
          marginTop: "20px",
          fontSize: "12px",
          color: "#888",
          textAlign: "center",
        }}
      >
        Build: {BUILD_DATE} JST
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

              await saveProductionRecord({
                configItems: items,
                ...results,
                updateTime:
                  new Date().toLocaleString(),
              });

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

              await saveProductionRecord({
                configItems: items,
                ...newResults,
                updateTime:
                  new Date().toLocaleString(),
              });

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

            await saveProductionRecord({
              configItems: items,
              ...results,
              updateTime: new Date().toLocaleString(),
            });

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