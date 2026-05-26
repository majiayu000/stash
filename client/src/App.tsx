import { Navigate, Route, Routes } from 'react-router-dom';
import { Workbench } from './workbench/Workbench';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Workbench />} />
      <Route path="/projects" element={<Workbench />} />
      <Route path="/projects/:projectId" element={<Workbench />} />
      <Route path="/tasks/:projectId" element={<Workbench />} />
      <Route path="/sessions" element={<Workbench />} />
      <Route path="/sessions/:projectId" element={<Workbench />} />
      <Route path="/skills" element={<Workbench />} />
      <Route path="/analytics" element={<Workbench />} />
      <Route path="/done" element={<Workbench />} />
      <Route path="/settings" element={<Workbench />} />
      <Route path="/agent/new" element={<Workbench />} />
      <Route path="/c/:id" element={<Workbench />} />
      <Route path="/c/:id/:projectId" element={<Workbench />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
