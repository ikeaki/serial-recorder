import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";

const DB_NAME = "serial-db";
const STORE_NAME = "history";

type HistoryItem = {
  id?: number;
  code: string;
  time: string;
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState("未読取");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
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

  const clearHistoryDB = async () => {
    const db = await openDB();

    const tx =
      db.transaction(STORE_NAME, "readwrite");

    tx.objectStore(STORE_NAME).clear();
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
  
  /* CVS出力
  const exportCsv = () => {

    const header = "日時,コード\n";

    const rows = history
      .map(
        item =>
          `"${item.time}","${item.code}"`
      )
      .join("\n");

    const csv = header + rows;

    const bom = "\uFEFF";

    const blob = new Blob(
      [bom + csv],
      {
        type: "text/csv;charset=utf-8;"
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      "serial-history.csv";

    link.click();

    URL.revokeObjectURL(url);
  };*/

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
  

      //alert("カメラ取得成功");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
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

  const scanQr = async () => {
    if (scanning) {
      return;
    }
    setScanning(true);
    
    try {
      const reader = new BrowserMultiFormatReader();

      const result = await reader.decodeOnceFromVideoDevice(
        undefined,
        videoRef.current!
      );

      const text = result.getText().trim();

      setResult(text);

      const exists =
        await existsRecord(text);

      if (exists) {
        playError();
        vibrateError();
        
        setResult("⚠ 重複: " + text);
        return;
      }

      const now = new Date().toLocaleString();

      await saveRecord(
        text,
        now
      );

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

      ctx.drawImage(
        videoRef.current,
        0,
        0
      );
      const cropX =
        canvas.width * 0.25;

      const cropY =
        canvas.height * 0.35;

      const cropW =
        canvas.width * 0.50;

      const cropH =
        canvas.height * 0.20;
            
      const cropCanvas =
        document.createElement("canvas");

      cropCanvas.width = cropW;
      cropCanvas.height = cropH;

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
        cropW,
        cropH
      );

      const image =
        cropCanvas.toDataURL("image/png");

      const result =
        await Tesseract.recognize(
          image,
          "eng"
        );

      const text =
      result.data.text.trim();
      
      if (!/^[0-9A-Z]+$/.test(text)) {
      setResult("⚠ OCR認識失敗");
      return;
      }

      const exists =
        await existsRecord(text);

      if (exists) {
        playError();
        vibrateError();
        setResult("⚠ 重複: " + text);
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

      setResult(
        "OCR: " + text
      );

    } finally {

      setOcrLoading(false);

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


  return (
    <div style={{ padding: 20 }}>

      <h1>シリアル管理アプリ</h1>
      <p>
      対応:
      QR Code / DataMatrix / Code128 /OCR
      </p>

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "250px",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "250px",
            objectFit: "cover",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "50%",
            height: "20%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        >

          {/* 左上 */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "20px",
              height: "20px",
              borderTop: "4px solid gray",
              borderLeft: "4px solid gray",
            }}
          />

          {/* 右上 */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "20px",
              height: "20px",
              borderTop: "4px solid gray",
              borderRight: "4px solid gray",
            }}
          />

          {/* 左下 */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "20px",
              height: "20px",
              borderBottom: "4px solid gray",
              borderLeft: "4px solid gray",
            }}
          />

          {/* 右下 */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: "20px",
              height: "20px",
              borderBottom: "4px solid gray",
              borderRight: "4px solid gray",
            }}
          />

        </div>

      </div>

      <br />

      <button
        style={{
          width: "100%",
          height: "50px",
          fontSize: "20px",
        }}
        disabled={scanning}
        onClick={scanQr}
      >
        {scanning ? "読取中..." : "QR読取"}
      </button>

      <h2>最新読取</h2>
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

      <button
        onClick={runOCR}
        disabled={ocrLoading}
        style={{
          width: "100%",
          height: "50px",
          marginTop: "10px"
        }}
      >
        {ocrLoading
          ? "OCR認識中..."
          : "OCR読取"}
      </button>

      <button
        //onClick={exportCsv}
        onClick={exportExcel}
      >
        出力
      </button>

      <button
        onClick={async () => {
          setHistory([]);
          await clearHistoryDB();
        }}
      >
        履歴クリア
      </button>

      <h2>履歴 ({history.length}件)</h2>

      {history.length === 0 ? (
        <p>履歴なし</p>
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

    </div>
  );
}