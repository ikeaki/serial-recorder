import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";

const DB_NAME = "serial-db";
const STORE_NAME = "history";
const PROD_STORE_NAME = "production";

type HistoryItem = {
  id?: number;
  code: string;
  time: string;
};

type ScanItem = {
  name: string;
  type: "QR" | "OCR";
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState("Not Scanned");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [scanHeight, setScanHeight] = useState(30);
  const [tab, setTab] = useState<"eval" | "prod">("eval");
  const [modelName, setModelName] = useState("None");
  const [results, setResults] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScanItem[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [scanWidth] = useState(50);
  const [zoom, setZoom] = useState(1);
  const cropTopRate = 0.2;
  const cropBottomRate = 0.2;
  const isMobile = window.innerWidth <= 768;
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pressTimer = useRef<number | null>(null);

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);

      request.onupgradeneeded = () => {

        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(
            STORE_NAME,
            {
              keyPath: "id",
              autoIncrement: true,
            }
          );
        }

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

  const saveRecord = async (
    code: string,
    time: string
  ) => {
    const db = await openDB();

    const tx =
      db.transaction(STORE_NAME, "readwrite");

    tx.objectStore(STORE_NAME).add({
      code,
      time,
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

          store.add(data);

          resolve();

        };

        clearReq.onerror =
          () => reject(clearReq.error);

      }
    );

  };
  

  const loadHistory = async () => {
    const db = await openDB();

    const tx =
      db.transaction(STORE_NAME, "readonly");

    const store =
      tx.objectStore(STORE_NAME);

    const request =
      store.getAll();

    return await new Promise<HistoryItem[]>(
      (resolve, reject) => {
        request.onsuccess =
          () => resolve(request.result);

        request.onerror =
          () => reject(request.error);
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

  useEffect(() => {

    loadProductionHistory()
      .then(data => {

        if (data.length === 0) {
          return;
        }

        const latest =
          data[data.length - 1];

        const {
          id,
          model,
          updateTime,
          ...scanData
        } = latest;

        setResults(scanData);

        if (model) {
          setModelName(model);
        }

      });

  }, []);  

  const clearHistoryDB = async () => {
    const db = await openDB();

    const tx =
      db.transaction(STORE_NAME, "readwrite");

    tx.objectStore(STORE_NAME).clear();
  };

  const clearHistory = async () => {

    playError();
    vibrateError();

    setHistory([]);
    await clearHistoryDB();
  };
  
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

    console.log(
      "Production Data Cleared"
    );

  };

  const existsRecord = async (
    code: string
  ): Promise<boolean> => {

    const db = await openDB();

    const tx =
      db.transaction(STORE_NAME, "readonly");

    const store =
      tx.objectStore(STORE_NAME);

    const request = store.getAll();

    const data = await new Promise<HistoryItem[]>(
      (resolve, reject) => {

        request.onsuccess =
          () => resolve(request.result);

        request.onerror =
          () => reject(request.error);
      }
    );

    return data.some(
      item => item.code === code
    );
  };

  const exportExcel = () => {

    const data = history.map(item => ({
      日時: item.time,
      コード: item.code,
    }));

    const worksheet =
      XLSX.utils.json_to_sheet(data);

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "履歴"
    );


    const now = new Date();

    const fileName =
      `serial-history-${
        now.getFullYear()
      }${
        String(now.getMonth() + 1).padStart(2, "0")
      }${
        String(now.getDate()).padStart(2, "0")
      }-${
        String(now.getHours()).padStart(2, "0")
      }${
        String(now.getMinutes()).padStart(2, "0")
      }${
        String(now.getSeconds()).padStart(2, "0")
      }.xlsx`;

    XLSX.writeFile(
      workbook,
      fileName
    );
  };

  const exportProductionExcel =
    async () => {

    const data =
      await loadProductionHistory();

    const latest =
      data.length > 0
        ? data[data.length - 1]
        : {
            model: modelName,
          };

    const { id, ...record } = latest;

    const exportData = [
      {
        Item: "UpdateTime",
        Value:
          record.updateTime ?? "",
      },

      {
        Item: "Model",
        Value: record.model ?? "",
      },

      ...items.map(item => ({
        Item: item.name,
        Value:
          record[item.name] ?? "",
      })),
    ];

    const worksheet =
      XLSX.utils.json_to_sheet(
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

    const fileName =
      `production-${
        now.getFullYear()
      }${
        String(
          now.getMonth() + 1
        ).padStart(2, "0")
      }${
        String(
          now.getDate()
        ).padStart(2, "0")
      }-${
        String(
          now.getHours()
        ).padStart(2, "0")
      }${
        String(
          now.getMinutes()
        ).padStart(2, "0")
      }.xlsx`;

    XLSX.writeFile(
      workbook,
      fileName
    );

  };
  
  const loadConfig = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = e => {
      try {
        const text =
          e.target?.result as string;

        const config =
          JSON.parse(text);

        setModelName(
          config.model ?? "None"
        );

        setItems(config.items ?? []);
        setCurrentIndex(0);
        //setResults({});

        console.log(config);

      } catch (err) {
        console.error(err);

        alert("Config Load Error");
      }
    };

    reader.readAsText(file);
  };

  useEffect(() => {

    fetch("/config/default.json")
      .then(res => res.json())
      .then(config => {

        setItems(config.items ?? []);

        setCurrentIndex(0);

        setModelName(prev =>
          prev !== "None"
            ? prev
            : config.model ?? "None"
        );

      })
      .catch(console.error);

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
    loadHistory()
      .then(data => {
        setHistory(
          [...data].reverse()
        );
      });
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

}, [scanHeight, scanWidth]);

  
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

      setResult(text);

      const exists =
        await existsRecord(text);

      if (exists) {
        playError();
        vibrateError();
        
        setResult("⚠ Duplicate: " + text);
        return;
      }

      const now = new Date().toLocaleString();

      await saveRecord(
        text,
        now
      );

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
          model: modelName,
          ...newResults,
          updateTime:
        new Date().toLocaleString(),
        });

        setCurrentIndex(prev =>
          Math.min(
            prev + 1,
            items.length
          )
        );
      }


      playSuccess();
      vibrateSuccess();

      setHistory(prev => {
        const newHistory = [
          {
            code: text,
            time: now,
          },
          ...prev,
        ];

        return newHistory;
      });
      
    } catch (err) {

      if (
        err instanceof Error &&
        err.message === "timeout"
      ) {
        setResult("Scan Timeout");
        return;
      }

      console.error(err);
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

      document.body.appendChild(canvas);

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
          await Tesseract.recognize(
            image,
            "eng",
            {
              tessedit_char_whitelist:
              "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
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
        setResult(
        `⚠ OCR Failed (${bestConfidence.toFixed(0)}%)`
        );
        return;
      }

      const rawText = bestText;
      
      const text =
      rawText
      .replace(/O/g, "0")
      .replace(/I/g, "1");
      
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

      document.body.appendChild(
        cropCanvas
      );
      
      if (
        text.length === 0 ||
        !/^[0-9A-Z]+$/.test(text)
      ) {
        setResult("⚠ OCR Failed");
        return;
      }

      const exists =
        await existsRecord(text);

      if (exists) {
        playError();
        vibrateError();
        setResult("⚠ Duplicate: " + text);
        return;
      }

      const now = new Date().toLocaleString();

      await saveRecord(
        text,
        now
      );

      setHistory(prev => [
        {
          code: text,
          time: now,
        },
        ...prev,
      ]);

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
          model: modelName,
          ...newResults,
          updateTime:
        new Date().toLocaleString(),
        });

        setCurrentIndex(prev =>
          Math.min(
            prev + 1,
            items.length
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
    const audioContext = new AudioContext();

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 1200;

    gain.gain.value = 0.1;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();

    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 100);
  };

  const playError = () => {
    const audioContext = new AudioContext();

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

    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 150);
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
    <div style={{ padding: 15 }}>

      <input
        type="file"
        accept=".json"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={loadConfig}
      />

    <div
      style={{
        display: "flex",
        marginBottom: "15px",
        userSelect: "none",
        WebkitUserSelect: "none",

      }}
    >
      <button
        style={{
          flex: 1,
          height: "50px",
        }}
        onClick={() => setTab("eval")}
      >
        TEST MODE
      </button>

      <button
        style={{
          flex: 1,
          height: "50px",
        }}
        onClick={() => setTab("prod")}
      >
        PRODUCTION MODE
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
        style={{
          width: "100%",
          height: "auto",
          display: "block",
        }}
      />
    </div>

        <div
        style={{
        display: "flex",
        gap: "10px",
        marginTop: "10px",
        width: "100%",
        }}
        >
          
        {/* Height */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: "1px solid #ccc",
            borderRadius: "8px",
            padding: "6px 10px",
            userSelect: "none",
            WebkitUserSelect: "none",

          }}
        >
          <button
            onClick={() =>
              setScanHeight(
                Math.max(5, scanHeight - 5)
              )
            }
          >
            −
          </button>

          <span>
            Height: {scanHeight}%
          </span>

          <button
            onClick={() =>
              setScanHeight(
                Math.min(60, scanHeight + 5)
              )
            }
          >
            ＋
          </button>
        </div>

        {/* Zoom */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: "1px solid #ccc",
            borderRadius: "8px",
            padding: "6px 10px",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <button
            onClick={() =>
              changeZoom(-0.5)
            }
          >
            −
          </button>

          <span>
            Zoom: {zoom.toFixed(1)}x
          </span>

          <button
            onClick={() =>
              changeZoom(0.5)
            }
          >
            ＋
          </button>
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
            height: "60px",
            fontSize: "20px",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          disabled={scanning}
          onClick={scanQr}
        >
          {scanning ? "Scanning..." : "Scan QR/Barcode"}
        </button>

        <button
          style={{
            flex: 1,
            height: "60px",
            fontSize: "20px",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          disabled={ocrLoading}
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
        <button
          style={{
            flex: 1,
            height: "60px",
            fontSize: "18px",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onClick={exportExcel}
        >
          Export
        </button>

        <button
          style={{
            flex: 1,
            height: "60px",
            fontSize: "18px",
            backgroundColor: "#ccc",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onPointerDown={() => {
            pressTimer.current = window.setTimeout(
              clearHistory,
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
        >
          Hold to Clear
        </button>

      </div>

      <h2>History ({history.length} items)</h2>

      {history.length === 0 ? (
        <p>No history</p>
      ) : (
        <ul>
          {history.map((item, index) => (
              <li
                key={index}
                style={{
                  textAlign: "left",
                  marginBottom: "10px",
                }}
              >
              <div>{item.time}</div>
              <div>{item.code}</div>
            </li>
          ))}
        </ul>
      )}
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

      <div>

        {/* Previous */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 60px 1fr",
            alignItems: "center",
            textAlign: "left",
            gap: "10px",
            color: "#888",
            fontSize: "14px",
            marginBottom: "15px",
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
            gap: "10px",
            marginBottom: "15px",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              fontWeight: "bold",
            }}
          >
            {items[currentIndex]?.name ?? ""}
          </div>

          <div
            style={{
              fontSize: "20px",
              color: "#666",
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

              const newResults = {
                ...results,
                [itemName]: e.target.value,
              };

              setResults(newResults);

              await saveProductionRecord({
                model: modelName,
                ...newResults,
                updateTime:
                  new Date().toLocaleString(),
              });

            }}

            onKeyDown={(e) => {

              if (e.key === "Enter") {

                setCurrentIndex(prev =>
                  Math.min(
                    items.length - 1,
                    prev + 1
                  )
                );

              }

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
          style={{
            display: "grid",
            gridTemplateColumns: "120px 60px 1fr",
            alignItems: "center",
            textAlign: "left",
            gap: "10px",
            color: "#888",
            fontSize: "14px",
            marginBottom: "15px",
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

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            gap: "10px",
          }}
        >
          <button
            style={{
              flex: 1,
              height: "50px",
            }}
            onClick={() =>
              setCurrentIndex(prev =>
                Math.max(0, prev - 1)
              )
            }
          >
            ↑ RETURN
          </button>

          <button
            style={{
              flex: 1,
              height: "50px",
            }}
            onClick={() =>
              setCurrentIndex(prev =>
                Math.min(
                  items.length - 1,
                  prev + 1
                )
              )
            }
          >
            NEXT ↓
          </button>
        </div>

      </div>


      </div>


    <div
      style={{
        display: "flex",
        gap: "10px",
        marginTop: "10px",
        marginBottom: "10px",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >

      <button
        style={{
          flex: 1,
          height: "56px",
        }}
        onClick={() =>
          fileInputRef.current?.click()
        }
      >
        Load Config
      </button>

      <div
        style={{
          flex: 1,
          border: "1px solid #ccc",
          borderRadius: "8px",
          padding: "15px",
          textAlign: "center",
        }}
      >
        {modelName}
      </div>


      <div
        style={{
          flex: 1,
          border: "1px solid #ccc",
          borderRadius: "8px",
          padding: "15px",
          textAlign: "center",
        }}
      >
      {
      Object.values(results)
      .filter(v => v.trim() !== "")
      .length
      }
      /
      {items.length}
      </div>
    </div>

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
        }}
        onClick={exportProductionExcel}
      >
        Export Production Data
      </button>

      <button
        style={{
          flex: 1,
          height: "50px",
          fontSize: "18px",
          backgroundColor: "#ccc",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        onPointerDown={() => {
          pressTimer.current = window.setTimeout(
            async () => {
              await clearProductionDB();
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
      >
        Hold to Clear DB
      </button>
      
    </div>

    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: "8px",
        maxHeight: "300px",
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
            onClick={() =>
              setCurrentIndex(index)
            }
            style={{
              display: "grid",
              gridTemplateColumns:
                "120px 60px 1fr",

              gap: "10px",

              alignItems: "center",
              textAlign: "left",
              padding: "10px",

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

            <div>
              {item.name}
            </div>

            <div>
              {item.type}
            </div>

            <div
              style={{
                overflow: "hidden",
                textOverflow:
                  "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {results[item.name] ?? ""}
            </div>

          </div>

        );

      })}

    </div>
    </>
    )}
    
    </div>
  );
}