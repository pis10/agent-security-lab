import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Academy } from "./pages/Academy";
import { Lesson } from "./pages/Lesson";
import { ObserveBoard } from "./pages/ObserveBoard";
import { ObserveStudio } from "./pages/ObserveStudio";
import { RangeBoard } from "./pages/RangeBoard";
import { Workspace } from "./pages/Workspace";

function LegacyRedirect() {
  const { targetId = "", scenarioId = "" } = useParams();
  const qs = scenarioId ? `?mission=${encodeURIComponent(scenarioId)}` : "";
  return <Navigate to={`/range/${targetId}${qs}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RangeBoard />} />
      <Route path="/range" element={<Navigate to="/" replace />} />
      <Route path="/range/:targetId" element={<Workspace />} />
      <Route path="/learn" element={<Academy />} />
      <Route path="/learn/:scenarioId" element={<Lesson />} />
      <Route path="/observe" element={<ObserveBoard />} />
      <Route path="/observe/:targetId" element={<ObserveStudio />} />
      <Route path="/t/:targetId/:scenarioId" element={<LegacyRedirect />} />
    </Routes>
  );
}
