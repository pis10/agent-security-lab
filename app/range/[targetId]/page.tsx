import { Suspense } from "react";
import { Workspace } from "../../../src/ui/pages/Workspace";

export default function Page() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
