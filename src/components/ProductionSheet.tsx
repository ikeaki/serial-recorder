import {
  useTranslation,
} from "react-i18next";

import type {
  ScanItem,
} from "../types";


type ProductionSheetProps = {
  // Productionシートの表示位置
  sheetLevel: number;

  // Production項目一覧
  items: ScanItem[];

  // 各項目の入力結果
  results: Record<string, string>;

  // 現在選択中の項目位置
  currentIndex: number;

  // シート表示位置を切り替える
  onToggleSheet: () => void;

  // Configファイル選択
  onLoad: () => void;

  // LOAD長押し開始
  onLoadPointerDown: () => void;

  // 共通の長押し終了
  onPointerEnd: () => void;

  // EXPORTクリック
  onExportClick: () => void;

  // EXPORT長押し開始
  onExportPointerDown: () => void;

  // CLEAR長押し開始
  onClearPointerDown: () => void;

  // Production項目長押し開始
  onItemPointerDown: (
    index: number
  ) => void;
};

export function ProductionSheet({
  sheetLevel,
  items,
  results,
  currentIndex,
  onToggleSheet,
  onLoad,
  onLoadPointerDown,
  onPointerEnd,
  onExportClick,
  onExportPointerDown,
  onClearPointerDown,
  onItemPointerDown,
}: ProductionSheetProps) {

  // 現在の言語に対応した翻訳関数を取得
  const { t } = useTranslation();

  return (
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

        boxShadow:
          "0 -2px 10px rgba(0,0,0,0.2)",

        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Productionシート開閉ハンドル */}
      <div
        onClick={onToggleSheet}
        style={{
          height: "40px",

          display: "flex",
          justifyContent: "center",
          alignItems: "center",

          cursor: "pointer",
        }}
      >
        {/* シート開閉用のバー */}
        <div
          style={{
            width: "40px",
            height: "4px",
            borderRadius: "2px",
            background: "#999",
          }}
        />
      </div>

      {/* Productionシート内容 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          padding: "10px",
        }}
      >
        {/* 上部操作ボタン */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          {/* Config読込 */}
          <button
            style={{
              flex: 1,
              height: "50px",
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onClick={onLoad}
            onPointerDown={onLoadPointerDown}
            onPointerUp={onPointerEnd}
            onPointerLeave={onPointerEnd}
          >
            {t("production.load")}
          </button>

          {/* Production結果出力 */}
          <button
            style={{
              flex: 1,
              height: "50px",
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onClick={onExportClick}
            onPointerDown={onExportPointerDown}
            onPointerUp={onPointerEnd}
            onPointerLeave={onPointerEnd}
          >
            {t("production.export")}
          </button>

          {/* Production結果消去 */}
          <button
            style={{
              flex: 1,
              height: "50px",
              backgroundColor: "#ccc",
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onPointerDown={onClearPointerDown}
            onPointerUp={onPointerEnd}
            onPointerLeave={onPointerEnd}
          >
            {t("production.clear")}
          </button>
        </div>

        {/* Production項目一覧 */}
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
            // 入力結果が存在する項目は完了扱い
            const completed =
              (results[item.name] ?? "") !== "";

            // 現在選択中の項目か判定
            const current =
              index === currentIndex;

            return (
              <div
                key={item.name}

                // 長押し処理の開始を親へ通知
                onPointerDown={() => {
                  onItemPointerDown(index);
                }}

                // 指を離す・領域外へ移動・操作取消時に
                // 長押しタイマーを解除
                onPointerUp={onPointerEnd}
                onPointerLeave={onPointerEnd}
                onPointerCancel={onPointerEnd}

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
                {/* 項目名 */}
                <div>{item.name}</div>

                {/* 読取タイプ */}
                <div>{item.type}</div>

                {/* 入力結果 */}
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
  );


}