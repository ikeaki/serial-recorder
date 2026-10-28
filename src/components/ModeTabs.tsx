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
        PRODUCTION MODE
      </button>

      <button
        style={{
          flex: 1,
          height: "36px",
        }}
        onClick={onTest}
      >
        TEST MODE
      </button>
    </div>
  );
}