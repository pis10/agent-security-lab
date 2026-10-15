import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="eyebrow font-mono">ASL · 404</div>
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">找不到这个页面</h1>
      <p className="text-[14px] text-ink-2">页面不存在，请检查产品或关卡地址。</p>
      <Link href="/" className="btn-primary mt-2">
        返回学习
      </Link>
    </main>
  );
}
