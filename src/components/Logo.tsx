export function Logo({ size = 40, dark = true }: { size?: number; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center rounded-[10px] bg-blue-600 font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
        aria-hidden="true"
      >
        WF
      </div>
      <div className={`text-base font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>WorkFlow</div>
    </div>
  );
}
