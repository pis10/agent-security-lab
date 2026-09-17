import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">ASL</div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">找不到这个页面</h1>
      <p className="text-sm text-slate-500">页面不存在，请检查产品或课程地址。</p>
      <Link
        href="/"
        className="inline-flex mt-2 items-center rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[13px] px-3 py-1.5"
      >
        返回靶场
      </Link>
    </main>
  );
}
