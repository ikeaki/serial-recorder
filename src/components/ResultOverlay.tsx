type ResultOverlayProps = {
  // 表示メッセージ
  message: string;

  // メッセージ色
  color: string;
};

export function ResultOverlay({
  message,
  color,
}: ResultOverlayProps) {
  // メッセージが無い時は非表示
  if (!message) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        color,
        fontSize: "48px",
        fontWeight: "bold",
        textShadow: "2px 2px 4px black",
        pointerEvents: "none",
        zIndex: 999,
      }}
    >
      {message}
    </div>
  );
}