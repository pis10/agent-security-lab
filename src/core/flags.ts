/**关卡断言：对轨迹与外发箱求值。
 *
 * - sink_received: { channel, contains, label? }
 * - tool_result: { name, contains, label? }
 */
import type { Assertion } from "../lib/contracts.ts";
import type { SinkState } from "./sinks.ts";
import type { Tracer } from "./trace.ts";

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  detail: string;
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function asRecord(v: unknown): Record<string, unknown> {
  return (v as Record<string, unknown>) ?? {};
}

function evalOne(assertion: Assertion, tracer: Tracer, sinks: SinkState, sessionId: string): AssertionResult {
  if ("sink_received" in assertion) {
    const spec = asRecord(assertion.sink_received);
    const channel = spec.channel as string | undefined;
    const needle = (spec.contains as string) ?? "";
    for (const ev of sinks.received({ channel, sessionId })) {
      if (contains(JSON.stringify(ev.payload), needle)) {
        return {
          assertion,
          passed: true,
          detail: `sink[${channel}] received payload containing '${needle}'`,
        };
      }
    }
    return { assertion, passed: false, detail: `no sink[${channel}] event containing '${needle}'` };
  }

  if ("tool_result" in assertion) {
    const spec = asRecord(assertion.tool_result);
    const name = spec.name as string;
    const needle = (spec.contains as string) ?? "";
    for (const ev of tracer.ofKind("tool_result")) {
      if (ev.data.name === name && contains(String(ev.data.result ?? ""), needle)) {
        return { assertion, passed: true, detail: `tool '${name}' result contained '${needle}'` };
      }
    }
    return { assertion, passed: false, detail: `no result of tool '${name}' contained '${needle}'` };
  }

  return { assertion, passed: false, detail: `unknown assertion form: ${Object.keys(assertion)}` };
}

export function evaluate(
  assertions: Assertion[],
  tracer: Tracer,
  sinks: SinkState,
  sessionId: string,
): AssertionResult[] {
  return assertions.map((a) => evalOne(a, tracer, sinks, sessionId));
}
