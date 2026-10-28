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
  return (
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
  );
}