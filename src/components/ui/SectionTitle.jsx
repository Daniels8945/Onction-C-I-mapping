// components/ui/SectionTitle.jsx
export default function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-2 mx-3 mt-3.5 mb-2">
      <span className="text-[9px] font-semibold tracking-[0.16em] uppercase text-slate whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-rim" />
    </div>
  );
}
