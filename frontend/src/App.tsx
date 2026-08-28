import { Route, Routes } from "react-router-dom";
import { MissionBoard } from "./pages/MissionBoard";
import { Workspace } from "./pages/Workspace";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MissionBoard />} />
      <Route path="/t/:targetId/:scenarioId" element={<Workspace />} />
    </Routes>
  );
}
