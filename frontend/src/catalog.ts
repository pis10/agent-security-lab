/** Product-facing catalog for the range. Teaching copy lives in Academy, not here. */

export interface ProductMeta {
  brand: string;
  tagline: string;
  icon: string;
  /** tailwind gradient classes for the product mark */
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
    brand: "星橙集市",
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
    blurb: "云主机、工作目录与作业记录。运维助手可代跑脚本、拉取 URL。",
  },
  mcp_playground: {
    brand: "MCP Hub",
    tagline: "工具市场",
    icon: "package",
    mark: "from-indigo-500 to-violet-600",
    blurb: "给助手安装 MCP server。工具描述由市场原样装载到 Host。",
  },
  browser_agent: {
    brand: "浏览工作台",
    tagline: "AI 浏览助手",
    icon: "globe",
    mark: "from-emerald-500 to-teal-600",
    blurb: "多标签浏览本地站点，助手可读取页面并按页面指示提交表单。",
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
