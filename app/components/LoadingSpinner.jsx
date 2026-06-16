export function LoadingSpinner() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", gap: 8,
      alignItems: "center",
      justifyContent: "center",
    }}>
      {[0, 0.2, 0.4].map((delay, i) => (
        <div key={i} style={{
          width: 8, height: 8,
          borderRadius: "50%",
          background: "#000",
          animation: `pulse 1.2s ${delay}s ease-in-out infinite`,
        }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
}
