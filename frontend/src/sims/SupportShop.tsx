import { useState } from "react";
import { SimChat } from "../components/SimChat";
import type { SimProps } from "../types";

/** NovaShop 仿真电商页（靶标 support_bot）。
 * 页面本体纯展示；攻击入口是右下角客服 widget 的输入框。 */

interface Product {
  name: string;
  desc: string;
  price: string;
  sales: string;
  emoji: string;
  tile: string; // 占位色块
}

const PRODUCTS: Product[] = [
  { name: "NovaKeys K87 机械键盘 青轴", desc: "热插拔 · RGB · 三模连接", price: "329", sales: "2.3万", emoji: "⌨️", tile: "from-sky-200 to-sky-100" },
  { name: "NovaBuds Pro 主动降噪耳机", desc: "-42dB 深度降噪 · 36h 续航", price: "499", sales: "1.8万", emoji: "🎧", tile: "from-violet-200 to-violet-100" },
  { name: "Ergo 人体工学电脑椅", desc: "4D 扶手 · 腰托可调", price: "899", sales: "8600", emoji: "🪑", tile: "from-emerald-200 to-emerald-100" },
  { name: "NovaClean 声波电动牙刷", desc: "5 档模式 · 90 天续航", price: "159", sales: "4.1万", emoji: "🪥", tile: "from-amber-200 to-amber-100" },
  { name: "BrewGo 便携意式咖啡机", desc: "20Bar 萃取 · 车载可用", price: "649", sales: "5300", emoji: "☕", tile: "from-rose-200 to-rose-100" },
  { name: "Luma 智能护眼台灯", desc: "国 AA 级 · 自动感光", price: "219", sales: "1.2万", emoji: "💡", tile: "from-indigo-200 to-indigo-100" },
];

const CATEGORIES = ["数码家电", "家居生活", "个护健康", "服饰鞋包", "食品生鲜", "母婴玩具"];

export default function SupportShop({ simState, messages, onSend, busy }: SimProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const tenant = typeof simState.tenant === "string" && simState.tenant ? simState.tenant : "guest";

  return (
    <div className="relative h-full bg-[#f4f4f5] text-slate-800">
      <div className="h-full overflow-y-auto">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-xl font-black text-[#ea580c] tracking-tight">NovaShop</span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">新星商城</span>
          </div>
          <div className="flex-1 max-w-md flex">
            <input
              className="flex-1 min-w-0 border-2 border-[#ea580c] rounded-l-full px-4 py-1 text-sm outline-none placeholder:text-slate-400"
              placeholder="搜索商品 / 店铺"
              readOnly
            />
            <button className="shrink-0 bg-[#ea580c] text-white text-sm px-5 rounded-r-full font-medium">
              搜索
            </button>
          </div>
          <nav className="hidden lg:flex items-center gap-4 text-[13px] text-slate-500">
            {CATEGORIES.slice(0, 4).map((c) => (
              <span key={c} className="hover:text-[#ea580c] cursor-pointer">{c}</span>
            ))}
          </nav>
          <div className="flex items-center gap-4 shrink-0">
            <div className="relative cursor-pointer" title="购物车">
              <span className="text-xl">🛒</span>
              <span className="absolute -top-1.5 -right-2 bg-[#ea580c] text-white text-[10px] rounded-full px-1 leading-3 py-0.5">
                3
              </span>
            </div>
            <div className="text-xs text-slate-500">
              欢迎您，<span className="font-mono font-semibold text-[#ea580c]">{tenant}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-16">
        {/* 英雄横幅 */}
        <section className="mt-4 rounded-xl overflow-hidden bg-gradient-to-r from-[#ea580c] via-[#f97316] to-[#fbbf24] text-white px-8 py-10 flex items-center justify-between">
          <div>
            <div className="text-xs tracking-widest opacity-80 mb-1">NOVASHOP 秋季大促 · 9.1 - 9.15</div>
            <h1 className="text-3xl font-black leading-tight">秋季焕新 满 300 减 50</h1>
            <p className="mt-2 text-sm opacity-90">跨店满减 · 爆款直降 · 会员折上折，全场包邮</p>
            <button className="mt-4 bg-white text-[#ea580c] text-sm font-bold px-6 py-2 rounded-full shadow">
              立即抢购 →
            </button>
          </div>
          <div className="hidden md:block text-7xl select-none">🍂</div>
        </section>

        {/* 分类条 */}
        <section className="mt-4 bg-white rounded-lg border border-slate-200 px-4 py-2.5 flex gap-6 text-[13px] text-slate-600 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <span key={c} className="whitespace-nowrap hover:text-[#ea580c] cursor-pointer">{c}</span>
          ))}
          <span className="whitespace-nowrap text-[#ea580c] font-medium">今日秒杀 ⚡</span>
        </section>

        {/* 商品网格 */}
        <section className="mt-4">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-lg font-bold">为你推荐</h2>
            <span className="text-xs text-slate-400">根据您的浏览记录智能推荐</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PRODUCTS.map((p) => (
              <div
                key={p.name}
                className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md hover:border-[#ea580c]/40 transition-shadow cursor-pointer"
              >
                <div className={`h-36 bg-gradient-to-br ${p.tile} flex items-center justify-center text-5xl select-none`}>
                  {p.emoji}
                </div>
                <div className="p-3">
                  <div className="text-[13px] font-medium leading-snug line-clamp-1">{p.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{p.desc}</div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <div className="text-[#ea580c]">
                      <span className="text-xs">¥</span>
                      <span className="text-lg font-bold">{p.price}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">已售 {p.sales}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 页脚：客服时间 / 政策链接（知识库文档的真实存在形式） */}
        <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500 flex flex-col md:flex-row gap-6 justify-between">
          <div>
            <div className="font-semibold text-slate-600 mb-1">客户服务</div>
            <div>在线客服时间：每日 9:00 – 22:00（AI 助手 7×24 在线）</div>
            <div className="mt-1">客服热线：400-800-9000</div>
          </div>
          <div>
            <div className="font-semibold text-slate-600 mb-1">帮助中心</div>
            <div className="flex gap-4">
              <span className="hover:text-[#ea580c] cursor-pointer">退款政策</span>
              <span className="hover:text-[#ea580c] cursor-pointer">运费说明</span>
              <span className="hover:text-[#ea580c] cursor-pointer">会员权益</span>
              <span className="hover:text-[#ea580c] cursor-pointer">隐私条款</span>
            </div>
          </div>
          <div className="text-slate-400 md:text-right">
            <div>© 2025 NovaShop 新星商城</div>
            <div className="mt-1">浙ICP备00000000号-1</div>
          </div>
        </footer>
      </main>
      </div>

      {/* 客服聊天 widget */}
      {chatOpen ? (
        <div className="absolute bottom-4 right-4 w-[360px] h-[480px] rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col bg-white">
          <div className="shrink-0 bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white px-4 py-3 flex items-center gap-2">
            <span className="text-lg">🎧</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold leading-tight">NovaShop 在线客服 · AI 助手</div>
              <div className="text-[11px] opacity-85 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-300" />
                在线 · 平均 10 秒内回复
              </div>
            </div>
            <button
              className="text-white/80 hover:text-white text-lg leading-none px-1"
              onClick={() => setChatOpen(false)}
              title="收起"
            >
              —
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-[#0a0e14]">
            <SimChat
              messages={messages}
              onSend={onSend}
              busy={busy}
              compact
              placeholder="描述您的问题，如订单、退款…"
            />
          </div>
          <div className="shrink-0 bg-white border-t border-slate-200 px-3 py-1 text-center text-[10px] text-slate-400">
            由 NovaShop 智能客服提供支持
          </div>
        </div>
      ) : (
        <button
          onClick={() => setChatOpen(true)}
          className="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xl flex flex-col items-center justify-center transition-colors"
          title="联系客服"
        >
          <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
          <span className="text-lg leading-none">💬</span>
          <span className="text-[10px] font-medium mt-0.5">客服</span>
        </button>
      )}
    </div>
  );
}
