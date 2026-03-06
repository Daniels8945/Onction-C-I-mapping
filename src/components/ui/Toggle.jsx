// components/ui/Toggle.jsx
export default function Toggle({ on }) {
  return (
    <div
      className={`relative w-[26px] h-[14px] rounded-full flex-shrink-0 transition-colors duration-200
        ${on ? "bg-accent" : "bg-rim2"}`}
    >
      <div
        className={`absolute top-[2px] left-[2px] w-[10px] h-[10px] rounded-full bg-white
          transition-transform duration-200 ${on ? "translate-x-3" : "translate-x-0"}`}
      />
    </div>
  );
}
