// components/AnalysisBox.jsx
export default function AnalysisBox({ text }) {
  return (
    <div className="mx-3 bg-elevated border border-rim rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-2.5 py-[7px] bg-surface border-b border-rim
        text-[9px] tracking-[0.14em] uppercase text-slate flex items-center gap-1.5">
        ⚡ Turf.js Engine
      </div>
      <div
        className="p-2.5 text-[10px] text-light leading-[1.8] min-h-[60px]
          [&_.text-accent]:text-accent [&_.text-green-gis]:text-green-gis
          [&_strong]:font-semibold"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    </div>
  );
}
