import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import * as XLSX from "xlsx";
import { createWorker } from "tesseract.js";

const DB_NAME = "serial-db";

const PROD_STORE_NAME = "production";
const BUILD_DATE = __BUILD_DATE__;


type ScanItem = {
  name: string;
  type: "QR" | "OCR";
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
  const [results, setResults] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScanItem[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [zoom, setZoom] = useState(1);
  const cropTopRate = 0.2;
  const cropBottomRate = 0.2;
  const isMobile = window.innerWidth <= 768;
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pressTimer = useRef<number | null>(null);

  const exportLongPressTriggered = useRef(false);


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
        .getAllKeys();

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
    setCurrentIndex(0);

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
      [
        "Export Time",
        new Date().toLocaleString(),
      ],
      [],
      ["Name", "Type", "Value", "Regex"],

      ...items.map(item => [
        item.name,
        item.type,
        record[item.name] ?? "",
        item.regex ?? "",
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
        [
          "Export Time",
          new Date().toLocaleString(),
        ],
        [],
        ["Name", "Type", "Value", "Regex"],

        ...items.map(item => [
          item.name,
          item.type,
          record[item.name] ?? "",
          item.regex ?? "",
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

      const fileName =
        `production-${
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
          type: String(row[1]) as
            "QR" | "OCR",
          value: String(row[2] ?? ""),
          regex: String(row[3] ?? ""),
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
    setCurrentIndex(0);

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
      !["Model", "ConfigURL"].includes(
        item.name
      ) &&
      (results[item.name] ?? "").trim() !== ""
  ).length;

  const totalCount = items.filter(
    item =>
      !["Model", "ConfigURL"].includes(
        item.name
      )
  ).length;


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


      playSuccess();
      vibrateSuccess();

      
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

          playError();
          vibrateError();

          setResult("⚠ OCR Failed");

          return;
        }

      }

      if (tab === "eval") {
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

        setResult(
          "⚠ Duplicate In Current Unit"
        );

        return;
      }


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

    gain.gain.value = 0.3;

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
          disabled={scanning}
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
          disabled={ocrLoading || !ocrReady}
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

              exportProductionExcel();

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