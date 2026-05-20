import { Navigate, Route, Routes } from 'react-router-dom';
import { Workbench } from './workbench/Workbench';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Workbench />} />
      <Route path="/c/k/:projectId" element={<Workbench />} />
      <Route path="/c/g/:sessionId" element={<Workbench />} />
      <Route path="/c/l/:workItemId" element={<Workbench />} />
      <Route path="/c/:detailId" element={<Workbench />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
