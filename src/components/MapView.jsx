export default function MapView({ containerRef }) {
  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
  );
}
