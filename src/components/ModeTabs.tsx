import {
  useTranslation,
} from "react-i18next";

type ModeTabsProps = {
  // PRODUCTION MODE選択
  onProduction: () => void;

  // TEST MODE選択
  onTest: () => void;
};

export function ModeTabs({
  onProduction,
  onTest,
}: ModeTabsProps) {

  // 現在の言語に対応した翻訳関数を取得
  const { t } = useTranslation();

  return (
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
        onClick={onProduction}
      >
        {t("mode.production")}
      </button>

      <button
        style={{
          flex: 1,
          height: "36px",
        }}
        onClick={onTest}
      >
        {t("mode.test")}
      </button>
    </div>
  );
}