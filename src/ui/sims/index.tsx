"use client";
import type { ComponentType } from "react";
import { SimChat } from "../components/SimChat";
import type { SimProps } from "../types";
import FakeBrowser from "./FakeBrowser";
import MailClient from "./MailClient";
import McpMarket from "./McpMarket";
import OpsConsole from "./OpsConsole";
import SupportShop from "./SupportShop";

function SimPlaceholder({ messages, onSend, busy }: SimProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
      <div className="text-dim font-mono text-sm">{/* 该靶标的仿真界面施工中 */}</div>
      <div className="w-full max-w-lg panel h-96">
        <SimChat messages={messages} onSend={onSend} busy={busy} />
      </div>
    </div>
  );
}

export const SIMS: Record<string, ComponentType<SimProps>> = {
  __placeholder: SimPlaceholder,
  mail_agent: MailClient,
  support_bot: SupportShop,
  devops_assistant: OpsConsole,
  mcp_playground: McpMarket,
  browser_agent: FakeBrowser,
};
