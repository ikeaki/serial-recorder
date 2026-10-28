import {
  useTranslation,
} from "react-i18next";

import type {
  AppLanguage,
} from "../i18n/i18n";

type LanguageSelectorProps = {
  // 現在選択中の言語
  language: AppLanguage;

  // 言語変更時の処理
  onLanguageChange: (
    language: AppLanguage
  ) => void | Promise<void>;
};

export function LanguageSelector({
  language,
  onLanguageChange,
}: LanguageSelectorProps) {
  const { t } = useTranslation();

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent:
          "space-between",
        gap: "10px",
      }}
    >
      {/* 言語選択ラベル */}
      <span>
        {t(
          "language.selectLabel"
        )}
      </span>

      {/* 表示言語選択 */}
      <select
        value={language}
        onChange={(event) => {
          void onLanguageChange(
            event.target
              .value as AppLanguage
          );
        }}
        style={{
          height: "40px",
          minWidth: "160px",
          fontSize: "16px",
        }}
      >
        <option value="ja">
          {t(
            "language.japanese"
          )}
        </option>

        <option value="en">
          {t(
            "language.english"
          )}
        </option>

        <option value="zh-CN">
          {t(
            "language.chineseSimplified"
          )}
        </option>
      </select>
    </label>
  );
}