import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState("未読取");

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
  navigator.serviceWorker?.getRegistrations()
    .then(regs => {
      alert("SW件数=" + regs.length);
      console.log(regs);
    });
}, []);

  const scanQr = async () => {
    try {
      const reader = new BrowserMultiFormatReader();

      const result = await reader.decodeOnceFromVideoDevice(
        undefined,
        videoRef.current!
      );

      setResult(result.getText());
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
      */}
      <div>
        SW:
        {"serviceWorker" in navigator ? "OK" : "NG"}
      </div>
      <h1>シリアル管理アプリ</h1>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        width={600}
      />

      <br />

      <button onClick={scanQr}>
        QR読取
      </button>

      <h2>結果</h2>

      <div>{result}</div>
    </div>
  );
}