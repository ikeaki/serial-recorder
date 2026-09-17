import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState("未読取");
  const [history, setHistory] = useState<
  { code: string; time: string }[]
  >([]);

const saveHistory = (
  data: { code: string; time: string }[]
) => {
  localStorage.setItem(
    "history",
    JSON.stringify(data)
  );
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
  const saved =
    localStorage.getItem("history");

  if (saved) {
    setHistory(JSON.parse(saved));
  }
}, []);

/*
useEffect(() => {
  navigator.serviceWorker?.getRegistrations()
    .then(regs => {
      // alert("SW件数=" + regs.length);
      console.log(regs);
    });
}, []);
*/
  const scanQr = async () => {
    try {
      const reader = new BrowserMultiFormatReader();

      const result = await reader.decodeOnceFromVideoDevice(
        undefined,
        videoRef.current!
      );

      const text = result.getText().trim();

      setResult(text);

      const exists =
        history.some(
          item => item.code === text
        );

      console.log("読取値:", text);
      console.log("履歴:", history);
      console.log("重複:", exists);

      if (exists) {
        setResult("⚠ 重複: " + text);
       // alert("重複です");
        return;
      }

      const now = new Date().toLocaleString();

      setHistory(prev => {
        const newHistory = [
          {
            code: text,
            time: now,
          },
          ...prev,
        ];

        saveHistory(newHistory);

        return newHistory;
      });
      
    } catch (err) {
      console.error(err);
    }
  };
  
  return (
    <div style={{ padding: 20 }}>
      {/*
      <p>{window.location.href}</p>
      <p>{navigator.userAgent}</p>
      <div>
        mediaDevices:
        {String(!!navigator.mediaDevices)}
      </div>

      <div>
        getUserMedia:
        {String(!!navigator.mediaDevices?.getUserMedia)}
      </div>
      
      <div>
        SW:
        {"serviceWorker" in navigator ? "OK" : "NG"}
      </div>*/}
      <h1>シリアル管理アプリ</h1>

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

      <br />

      <button
        style={{
          width: "100%",
          height: "50px",
          fontSize: "20px",
        }}
        onClick={scanQr}
      >
        QR読取
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
        onClick={() => {
          setHistory([]);
          localStorage.removeItem("history");
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