// components/ui/ToolButton.jsx
export default function ToolButton({ active = false, onClick, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`
        h-[30px] px-3 rounded-[5px] border text-[10px] uppercase tracking-widest
        font-mono flex items-center gap-1.5 whitespace-nowrap cursor-pointer
        transition-all duration-150 flex-shrink-0
        ${active
          ? "border-accent text-accent bg-accent/10"
          : "border-rim text-slate hover:border-accent hover:text-accent hover:bg-accent/10"
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}
