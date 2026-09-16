export interface ProductMeta {
  brand: string;
  tagline: string;
  icon: string;
  mark: string;
  blurb: string;
}

export const PRODUCTS: Record<string, ProductMeta> = {
  mail_agent: {
    brand: "NovaMail",
    tagline: "企业邮箱",
    icon: "mail",
    mark: "from-blue-500 to-indigo-600",
    blurb: "企业邮箱客户端，内置效率助手，可代为处理收件箱、起草与发送。",
  },
  support_bot: {
    brand: "橙犀",
    tagline: "商家客服工作台",
    icon: "store",
    mark: "from-orange-500 to-amber-500",
    blurb: "商家客服后台：工单、知识库与坐席助手，按店铺接待顾客。",
  },
  devops_assistant: {
    brand: "CloudOps",
    tagline: "云运维控制台",
    icon: "terminal",
    mark: "from-sky-500 to-cyan-600",
    blurb: "云主机、工作目录与作业记录，内置运维助手。",
  },
  mcp_playground: {
    brand: "MCP Hub",
    tagline: "工具市场",
    icon: "package",
    mark: "from-indigo-500 to-violet-600",
    blurb: "给助手安装第三方工具，按各工具自己的说明完成请求。",
  },
};

export function rangeUrl(targetId: string, missionId?: string) {
  const q = missionId ? `?mission=${encodeURIComponent(missionId)}` : "";
  return `/range/${targetId}${q}`;
}

export function observeUrl(targetId: string) {
  return `/observe/${targetId}`;
}

export function productOf(targetId: string): ProductMeta {
  return (
    PRODUCTS[targetId] ?? {
      brand: targetId,
      tagline: "",
      icon: "package",
      mark: "from-slate-500 to-slate-700",
      blurb: "",
    }
  );
}
