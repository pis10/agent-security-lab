import { getData } from "../../../src/targets/mock_remote.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return getData(req);
}
