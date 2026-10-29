import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import "./i18n/i18n";

import App from './App.tsx'

import { Analytics } from '@vercel/analytics/react'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)

// Reactの初期描画開始後に起動確認表示を削除
window.requestAnimationFrame(() => {
  document
    .getElementById("boot-status")
    ?.remove();
});