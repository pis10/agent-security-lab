"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { productOf, rangeUrl } from "../catalog";
import type { Observation, ObservationCheck, Scenario } from "../types";
import { assertionLabel } from "../types";
import { Tag, TierBadge } from "./Badge";
import { Icon } from "./Icon";
import { TaskHints } from "./TaskHints";

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-line">
      <summary className="list-none cursor-pointer select-none px-5 py-3 flex items-center gap-2 text-[13px] font-medium text-ink hover:bg-sunken/50 [&::-webkit-details-marker]:hidden">
        <Icon name={icon} size={14} className="text-muted" />
        <span className="flex-1">{title}</span>
        <Icon name="chevron-down" size={14} className="text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-4">{children}</div>
    </details>
  );
}

function Checks({ checks }: { checks: ObservationCheck[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.label} className="flex items-start gap-2 text-[13px] leading-relaxed">
          <span
            aria-hidden
            className={`mt-0.5 h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 ${
              c.passed ? "bg-ok border-ok text-white" : "border-line-strong bg-surface"
            }`}
          >
            {c.passed && <Icon name="check" size={11} strokeWidth={2.6} />}
          </span>
          <span className={c.passed ? "text-ok" : "text-ink-2"}>
            {c.label}
            <span className="sr-only">{c.passed ? "（已达成）" : "（未达成）"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**关卡工作台左侧的任务卡：目标、实时通关条件、原理、分级提示与答案、复测指引。 */
export function TaskPanel({
  scenario,
  observation,
  missions,
  targetId,
  defensesOn,
  onOpenObserve,
}: {
  scenario: Scenario | null;
  observation: Observation | undefined;
  missions: Scenario[];
  targetId: string;
  defensesOn: number;
  onOpenObserve: (tab: "timeline" | "sink" | "defenses") => void;
}) {
  const product = productOf(targetId);

  if (!scenario) {
    return (
      <div className="pb-6">
        <div className="px-5 pt-5 pb-4">
          <div className="eyebrow">自由探索</div>
          <h2 className="mt-1.5 text-[18px] font-semibold tracking-tight text-ink">{product.brand}</h2>
          <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{product.blurb}</p>
          <p className="mt-2 text-[12px] text-muted leading-relaxed">
            不绑定关卡时可以随意使用产品，但不会显示任务和提示。选择一关开始：
          </p>
        </div>
        <ul className="px-3 space-y-1">
          {missions.map((s) => (
            <li key={s.id}>
              <Link
                href={rangeUrl(targetId, s.id)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 hover:bg-sunken transition-colors"
              >
                <TierBadge tier={s.tier} size="sm" />
                <span className="flex-1 min-w-0 text-[13px] text-ink truncate">{s.title}</span>
                <Icon name="chevron-right" size={14} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const checks: ObservationCheck[] = observation?.checks?.length
    ? observation.checks
    : scenario.assertions.map((a) => ({ label: assertionLabel(a) || "条件", passed: false }));
  const passed = observation?.passed ?? false;
  const doneCount = checks.filter((c) => c.passed).length;
  const others = missions.filter((s) => s.id !== scenario.id);

  return (
    <div className="pb-6">
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={scenario.tier} />
          <Tag>{scenario.vuln_class}</Tag>
          {passed ? (
            <Tag tone="ok" icon="check">
              已通关
            </Tag>
          ) : (
            <Tag tone="neutral">
              <span className="tabular-nums">
                {doneCount}/{checks.length}
              </span>
            </Tag>
          )}
        </div>
        <h2 className="mt-2.5 text-[18px] font-semibold tracking-tight text-ink leading-snug">{scenario.title}</h2>
        <div className="mt-3 rounded-lg border border-line bg-sunken/50 px-3.5 py-3">
          <div className="text-[11px] font-medium text-muted mb-1">目标</div>
          <p className="text-[13px] leading-relaxed text-ink">{scenario.goal}</p>
        </div>
      </div>

      <Section title="通关条件" icon="flag">
        <Checks checks={checks} />
        <button
          type="button"
          className="mt-3 text-[12px] text-info hover:underline underline-offset-4"
          onClick={() => onOpenObserve("timeline")}
        >
          在观测里查看工具调用与外发
        </button>
      </Section>

      <Section title="原理" icon="book-open" defaultOpen={!passed}>
        <p className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap">{scenario.principle}</p>
      </Section>

      <Section title="提示与答案" icon="lightbulb" defaultOpen={false}>
        <TaskHints key={scenario.id} scenario={scenario} />
      </Section>

      {scenario.defenses.length > 0 && (
        <Section title="防护与复测" icon="shield" defaultOpen={passed}>
          <ul className="space-y-2 mb-3">
            {scenario.defenses.map((d) => (
              <li key={d.id} className="text-[13px] leading-relaxed">
                <span className="font-medium text-ink">{d.name}</span>
                <span className="block text-[12px] text-ink-2 mt-0.5">{d.description}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted leading-relaxed mb-3">
            通关后开启防护、清空对话，再用同样的方法试一次。看到「实际拦截」才说明防护生效，没有通关不等于防住了。
          </p>
          <button type="button" className="btn btn-sm w-full" onClick={() => onOpenObserve("defenses")}>
            <Icon name="shield-check" size={13} />
            {defensesOn > 0 ? `管理防护（已开启 ${defensesOn} 项）` : "打开防护开关"}
          </button>
        </Section>
      )}

      {others.length > 0 && (
        <div className="border-t border-line px-5 pt-4">
          <div className="text-[12px] text-muted mb-2">本产品的其他关卡</div>
          <ul className="space-y-1">
            {others.map((s) => (
              <li key={s.id}>
                <Link
                  href={rangeUrl(targetId, s.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 text-[13px] text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  <TierBadge tier={s.tier} size="sm" />
                  <span className="truncate">{s.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
