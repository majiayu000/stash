import { Navigate, Route, Routes } from 'react-router-dom';
import { Workbench } from './workbench/Workbench';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Workbench />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
