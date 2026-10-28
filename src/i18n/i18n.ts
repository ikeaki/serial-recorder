import i18n from "i18next";
import {
  initReactI18next,
} from "react-i18next";

import ja from "./locales/ja.json";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

// 対応言語
export type AppLanguage =
  | "ja"
  | "en"
  | "zh-CN";

// 言語設定を保存するキー
export const LANGUAGE_STORAGE_KEY =
  "serial-recorder-language";

// 保存済み言語を取得
const savedLanguage =
  localStorage.getItem(
    LANGUAGE_STORAGE_KEY
  );

// 保存値が対応言語か確認
const isAppLanguage = (
  value: string | null
): value is AppLanguage => {
  return (
    value === "ja" ||
    value === "en" ||
    value === "zh-CN"
  );
};

// 保存済み言語があれば使用し、
// 未保存または不正な場合は日本語を使用
const initialLanguage: AppLanguage =
  isAppLanguage(savedLanguage)
    ? savedLanguage
    : "ja";

// Reactでi18nextを使用するための初期設定
void i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: {
        translation: ja,
      },
      en: {
        translation: en,
      },
      "zh-CN": {
        translation: zhCN,
      },
    },

    lng: initialLanguage,
    fallbackLng: "ja",

    interpolation: {
      // Reactが文字列をエスケープするため無効化
      escapeValue: false,
    },
  });

export default i18n;