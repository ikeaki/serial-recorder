import type {
  ScanItem,
} from "../types";

type ProductionCurrentItemProps = {
  // Production項目一覧
  items: ScanItem[];

  // 各項目の入力結果
  results: Record<string, string>;

  // 現在選択中の項目位置
  currentIndex: number;

  // Previous選択時の処理
  onPrevious: () => void | Promise<void>;

  // 現在値を変更した時の処理
  onValueChange: (value: string) => void;

  // Enterキーで入力を確定する処理
  onValueEnter: (value: string) => void | Promise<void>;

  // Next選択時の処理
  onNext: () => void | Promise<void>;
};

export function ProductionCurrentItem({
  items,
  results,
  currentIndex,
  onPrevious,
  onValueChange,
  onValueEnter,
  onNext,
}: ProductionCurrentItemProps) {
 
    return (
    <div>
        {/* 1つ前のProduction項目 */}
        <div
        onClick={onPrevious}
        style={{
            display: "grid",
            gridTemplateColumns: "120px 60px 1fr",
            alignItems: "center",
            textAlign: "left",
            gap: "10px",
            color: "#888",
            fontSize: "14px",
            height: "32px",
            marginBottom: "15px",
            cursor: "pointer",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "manipulation",
        }}
        >
        {/* 前項目の名前 */}
        <div>
            {items[currentIndex - 1]?.name ?? "-"}
        </div>

        {/* 前項目の読取タイプ */}
        <div>
            {items[currentIndex - 1]?.type ?? ""}
        </div>

        {/* 前項目の入力結果 */}
        <div>
            {
            results[
                items[currentIndex - 1]?.name
            ] ?? ""
            }
        </div>
        </div>

        {/* 現在選択中のProduction項目 */}
        <div
        style={{
            display: "grid",
            gridTemplateColumns: "120px 60px 1fr",
            alignItems: "center",
            height: "60px",
            gap: "10px",
            overflow: "hidden",
        }}
        >
        {/* 現在項目の名前 */}
        <div
            style={{
            height: "60px",

            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",

            fontSize: "24px",
            fontWeight: "bold",
            lineHeight: "1.1",

            overflow: "hidden",
            wordBreak: "break-word",

            textAlign: "left",
            }}
        >
            {items[currentIndex]?.name ?? ""}
        </div>

        {/* 現在項目の読取タイプ */}
        <div
            style={{
            fontSize: "20px",
            color: "#666",
            textAlign: "left",
            }}
        >
            {items[currentIndex]?.type ?? ""}
        </div>

        {/* 現在項目の入力結果 */}
        <input
            value={
            results[
                items[currentIndex]?.name
            ] ?? ""
            }
            onChange={(e) => {
            // 入力値の変更を親コンポーネントへ通知
            onValueChange(e.target.value);
            }}
            onKeyDown={async (e) => {
            // Enterキー以外は処理しない
            if (e.key !== "Enter") return;

            // 入力値の前後空白を除去して親へ渡す
            const value = e.currentTarget.value.trim();

            await onValueEnter(value);
            }}
            style={{
            width: "100%",
            height: "50px",
            fontSize: "24px",
            boxSizing: "border-box",
            }}
        />

        </div>

        {/* 1つ次のProduction項目 */}
        <div
        onClick={onNext}
        style={{
            display: "grid",
            gridTemplateColumns: "120px 60px 1fr",
            alignItems: "center",
            textAlign: "left",
            gap: "10px",
            color: "#888",
            fontSize: "14px",
            height: "32px",
            marginBottom: "15px",

            cursor: "pointer",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "manipulation",
        }}
        >
        {/* 次項目の名前 */}
        <div>
            {items[currentIndex + 1]?.name ?? "-"}
        </div>

        {/* 次項目の読取タイプ */}
        <div>
            {items[currentIndex + 1]?.type ?? ""}
        </div>

        {/* 次項目の入力結果 */}
        <div>
            {
            results[
                items[currentIndex + 1]?.name
            ] ?? ""
            }
        </div>
        </div>


    </div>
    );

}