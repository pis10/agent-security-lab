"use client";
import Link from "next/link";
import { tierRank } from "../scenarios/types.ts";
import { productOf, rangeUrl } from "./catalog";
import { Tag, TierBadge } from "./components/Badge";
import { Icon } from "./components/Icon";
import { PageHeader, Shell, useLiveProgress } from "./components/Shell";
import { useSessionUser } from "./session";
import type { Meta, ProgressMap, Scenario, TargetInfo } from "./types";

function missionUrl(s: Scenario) {
  return rangeUrl(s.target, s.id);
}

/**尚未配置模型：管理员看到去配置的入口，学员看到等待提示。 */
export function ModelMissingBanner({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="card border-warn/30 bg-warn-soft px-5 py-4 mb-6 flex flex-wrap items-center gap-4">
      <span className="h-9 w-9 rounded-lg bg-surface text-warn border border-warn/25 flex items-center justify-center">
        <Icon name="alert-triangle" size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-ink">尚未配置模型</div>
        <p className="text-[13px] text-ink-2 mt-0.5 leading-relaxed">
          {isAdmin
            ? "助手需要一个可用的大模型才能工作。配置并测试连接后，学员即可开始做题。"
            : "管理员还没有配置模型，助手暂时无法回复。可以先浏览关卡和产品，配置好后刷新页面即可。"}
        </p>
      </div>
      {isAdmin && (
        <Link href="/admin/settings" className="btn-primary">
          去配置模型
          <Icon name="arrow-right" size={14} />
        </Link>
      )}
    </div>
  );
}

function NextUp({ next, captured, total }: { next: Scenario | null; captured: number; total: number }) {
  if (!next) {
    return (
      <div className="card px-6 py-5 flex flex-wrap items-center gap-4">
        <span className="h-11 w-11 rounded-xl bg-ok-soft text-ok flex items-center justify-center">
          <Icon name="flag" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-ink">五关已全部通关</div>
          <p className="text-[13px] text-ink-2 mt-0.5">
            可以回到任意一关，在工作台里打开防护后清空对话再试一次，确认防护确实生效。
          </p>
        </div>
        <Link href="/observe" className="btn">
          <Icon name="activity" size={14} />
          查看观测记录
        </Link>
      </div>
    );
  }
  const product = productOf(next.target);
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-5 flex flex-wrap items-center gap-5">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{captured === 0 ? "从第一关开始" : "继续下一关"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <TierBadge tier={next.tier} />
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">{next.title}</h2>
          </div>
          <p className="mt-2 text-[14px] text-ink-2 leading-relaxed max-w-3xl">{next.goal}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span>{product.brand}</span>
            <span aria-hidden>·</span>
            <span>{next.vuln_class}</span>
          </div>
        </div>
        <Link href={missionUrl(next)} className="btn-primary h-10 px-5">
          <Icon name="play" size={13} />
          {captured === 0 ? "开始第一关" : `进入 ${next.tier}`}
        </Link>
      </div>
      <div className="h-1 bg-sunken" aria-hidden>
        <div className="h-full bg-ok" style={{ width: `${(captured / Math.max(total, 1)) * 100}%` }} />
      </div>
    </div>
  );
}

function PathRow({ s, done, isNext }: { s: Scenario; done: boolean; isNext: boolean }) {
  const product = productOf(s.target);
  return (
    <li>
      <Link
        href={missionUrl(s)}
        className="group flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-sunken/60 transition-colors"
      >
        <span
          className={`h-8 w-8 rounded-full border flex items-center justify-center shrink-0 ${
            done
              ? "bg-ok text-white border-ok"
              : isNext
                ? "border-ink text-ink bg-surface"
                : "border-line-strong text-muted bg-surface"
          }`}
          aria-hidden
        >
          {done ? (
            <Icon name="check" size={15} strokeWidth={2.4} />
          ) : (
            <span className="font-mono text-[12px] font-semibold">{tierRank(s.tier)}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={s.tier} size="sm" />
            <span className="text-[15px] font-medium text-ink">{s.title}</span>
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {product.brand} · {s.vuln_class}
          </div>
        </div>
        <span className="flex items-center gap-3 ml-12 sm:ml-0">
          {done ? (
            <Tag tone="ok" icon="check">
              已通关
            </Tag>
          ) : isNext ? (
            <Tag tone="info">下一关</Tag>
          ) : (
            <Tag>未开始</Tag>
          )}
          <Icon name="chevron-right" size={16} className="text-muted group-hover:text-ink transition-colors" />
        </span>
      </Link>
    </li>
  );
}

function ProductCard({
  target,
  related,
  progress,
}: {
  target: TargetInfo;
  related: Scenario[];
  progress: ProgressMap;
}) {
  const product = productOf(target.id);
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <span
          className={`h-11 w-11 rounded-xl bg-linear-to-br ${product.mark} text-white flex items-center justify-center shrink-0`}
        >
          <Icon name={product.icon} size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink">{product.brand}</div>
          <div className="text-[12px] text-muted mt-0.5">{product.tagline}</div>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-ink-2 leading-relaxed flex-1">{product.blurb}</p>
      {related.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {related.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-[13px]">
              <TierBadge tier={s.tier} size="sm" />
              <span className={`truncate ${progress[s.id] ? "text-ok" : "text-ink-2"}`}>{s.title}</span>
              {progress[s.id] && <Icon name="check" size={13} className="text-ok" />}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-2">
        <Link href={rangeUrl(target.id)} className="btn btn-sm">
          自由探索
        </Link>
        <Link href={`/observe/${target.id}`} className="btn-ghost btn-sm">
          <Icon name="activity" size={13} />
          观测记录
        </Link>
      </div>
    </div>
  );
}

export function Home({
  targets,
  scenarios,
  progress: initialProgress,
  meta,
}: {
  targets: TargetInfo[];
  scenarios: Scenario[];
  progress: ProgressMap;
  meta: Meta;
}) {
  const user = useSessionUser();
  const progress = useLiveProgress(initialProgress);
  const ordered = [...scenarios].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  const captured = ordered.filter((s) => progress[s.id]).length;
  const next = ordered.find((s) => !progress[s.id]) ?? null;
  const firstTier = (id: string) => {
    const tiers = scenarios.filter((s) => s.target === id).map((s) => tierRank(s.tier));
    return tiers.length ? Math.min(...tiers) : 99;
  };
  const products = [...targets].sort((a, b) => firstTier(a.id) - firstTier(b.id));

  return (
    <Shell active="home" meta={meta} progress={initialProgress} scenarioCount={scenarios.length}>
      <main className="mx-auto max-w-[1200px] px-4 sm:px-6 py-8 sm:py-10">
        <PageHeader
          title="学习"
          description="按 L1 至 L5 顺序进行。每关在对应产品的工作台里完成，任务卡、提示和观测都在同一页。"
        />
        {!meta.llm_model && <ModelMissingBanner isAdmin={!!user?.is_admin} />}

        <NextUp next={next} captured={captured} total={ordered.length} />

        <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="path-title" className="min-w-0">
            <div className="flex items-baseline justify-between mb-3">
              <h2 id="path-title" className="text-[16px] font-semibold text-ink">
                学习路径
              </h2>
              <span className="text-[13px] text-muted tabular-nums">
                已通关 {captured}/{ordered.length}
              </span>
            </div>
            <ol className="card divide-y divide-line overflow-hidden">
              {ordered.map((s) => (
                <PathRow key={s.id} s={s} done={!!progress[s.id]} isNext={next?.id === s.id} />
              ))}
            </ol>
          </section>

          <section aria-labelledby="products-title" className="min-w-0">
            <div className="flex items-baseline justify-between mb-3">
              <h2 id="products-title" className="text-[16px] font-semibold text-ink">
                仿真产品
              </h2>
              <span className="text-[13px] text-muted">不选关卡也可以自由探索</span>
            </div>
            <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))]">
              {products.map((t) => (
                <ProductCard
                  key={t.id}
                  target={t}
                  related={ordered.filter((s) => s.target === t.id)}
                  progress={progress}
                />
              ))}
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}
