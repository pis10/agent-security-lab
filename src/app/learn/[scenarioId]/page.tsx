import { notFound, redirect } from "next/navigation";
import { getScenario } from "@/scenarios/index.ts";
import { rangeUrl } from "@/ui/catalog.ts";

type Props = { params: Promise<{ scenarioId: string }> };

/**课程内容已并入关卡工作台的任务卡。 */
export default async function Page({ params }: Props) {
  const { scenarioId } = await params;
  const scenario = getScenario(scenarioId);
  if (!scenario) notFound();
  redirect(rangeUrl(scenario.target, scenario.id));
}
