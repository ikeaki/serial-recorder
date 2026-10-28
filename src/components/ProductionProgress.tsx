import type {
  ScanItem,
} from "../types";

type ProductionProgressProps = {
  // 現在の読み取り結果
  results: Record<string, string>;

  // シート定義
  items: ScanItem[];

  // 現在処理中の項目
  currentIndex: number;

  // 進捗
  progressCount: number;
  totalCount: number;
};

export function ProductionProgress({
  results,
  items,
  currentIndex,
  progressCount,
  totalCount,
}: ProductionProgressProps) {

  // 現在選択中項目のValue
  const currentValue =
    results[
    items[currentIndex]?.name
    ] ?? "-";

  return (
    <div
      style={{
        position: "absolute",
        top: "0px",
        left: "6px",
        width: "calc(100% - 12px)",

        color: "white",
        fontSize: "12px",
        fontWeight: "bold",

        overflow: "hidden",
        textAlign: "left",

        textShadow:
          "1px 1px 2px black, -1px -1px 2px black",

        pointerEvents: "none",
      }}
    >
      {/* 1行目：Model・現在項目・Type・進捗 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "auto 6px minmax(0, 1fr) 6px auto 6px auto",
          alignItems: "center",
          columnGap: "6px",

          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {/* Model */}
        <span>
          {results["Model"] ?? "-"}
        </span>

        <span>｜</span>

        {/* 現在項目名 */}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {items[currentIndex]?.name ?? "-"}
        </span>

        <span>｜</span>

        {/* 現在項目のType */}
        <span>
          {items[currentIndex]?.type ?? "-"}
        </span>

        <span>｜</span>

        {/* Production進捗 */}
        <span>
          {progressCount}/{totalCount}
        </span>
      </div>

      {/* 2行目：現在項目のValue */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "auto 6px minmax(0, 1fr) 6px auto 6px auto",
          columnGap: "6px",

          marginTop: "2px",

          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {/* Model列と最初の区切り分を空ける */}
        <span />

        <span />

        {/* 現在Valueを項目名の開始位置に合わせる */}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {currentValue || "-"}
        </span>
      </div>
    </div>
  );
}