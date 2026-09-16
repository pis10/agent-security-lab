"use client";

import { useParams } from "next/navigation";

/**next/navigation 的 useParams 值可能是 string[]（catch-all 段），统一收成 string。 */
export function useParam(name: string): string {
  const params = useParams();
  const v = params[name];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}
