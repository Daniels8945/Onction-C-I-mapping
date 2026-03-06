// components/InfoCard.jsx
export default function InfoCard({ feature }) {
  return (
    <div className="mx-3 bg-elevated border border-rim rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-2.5 py-[7px] bg-surface border-b border-rim
        text-[9px] tracking-[0.14em] uppercase text-slate flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-gis animate-pulse" />
        Feature Info
      </div>

      <div className="p-2.5">
        {feature ? (
          <>
            <p className="font-display text-[13px] font-bold text-accent mb-0.5 leading-snug">
              {feature.name}
            </p>
            <p className="text-[9px] tracking-[0.12em] uppercase text-slate mb-2.5">
              {feature.type}
            </p>
            {feature.rows.map(([key, val]) => (
              <div key={key}
                className="flex justify-between text-[10px] py-1 border-t border-rim gap-3">
                <span className="text-slate flex-shrink-0">{key}</span>
                <span className="text-light text-right">{val}</span>
              </div>
            ))}
          </>
        ) : (
          <p className="text-[11px] text-slate text-center py-2 opacity-60 leading-relaxed">
            Click any feature<br />on the map
          </p>
        )}
      </div>
    </div>
  );
}
