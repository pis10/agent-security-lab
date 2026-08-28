export function FlagBanner({ onClose, onReport }: { onClose: () => void; onReport: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flag-banner panel border-ok/60 px-10 py-8 text-center max-w-md">
        <div className="font-mono text-ok text-2xl tracking-widest">FLAG CAPTURED</div>
        <div className="mt-3 text-sm text-slate-300">
          攻击链成立——所有目标均由<b className="text-warn">可观察副作用</b>证实，而非模型的口头声明。
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <button className="btn-ok" onClick={onReport}>导出通关报告</button>
          <button className="btn" onClick={onClose}>继续研究</button>
        </div>
      </div>
    </div>
  );
}
