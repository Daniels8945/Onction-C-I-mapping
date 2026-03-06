// components/ui/LayerRow.jsx
import Toggle from "./Toggle";

export default function LayerRow({ colorDot, label, badge, on, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-[7px] rounded-md cursor-pointer
        hover:bg-elevated transition-colors duration-100 mb-[2px] select-none"
    >
      <div
        className="w-2 h-2 rounded-[2px] flex-shrink-0"
        style={{ background: colorDot }}
      />
      <span className="text-[11px] text-light flex-1">{label}</span>
      <span className="text-[9px] text-slate bg-surface border border-rim rounded-[3px] px-1 py-px">
        {badge}
      </span>
      <Toggle on={on} />
    </div>
  );
}
