import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './pages/shared/Shell';
import { OverviewPage } from './pages/OverviewPage';
import { InboxPage } from './pages/InboxPage';
import { TodoPage } from './pages/TodoPage';
import { SessionsPage } from './pages/SessionsPage';
import { WorkboardPage } from './pages/WorkboardPage';
import { EvidencePage } from './pages/EvidencePage';

function Stub({ title }: { title: string }) {
  return (
    <div className="p-6 text-muted text-sm">
      <div className="text-ink font-bold text-base mb-1">{title}</div>
      Coming in a later slice.
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/todo" element={<TodoPage />} />
        <Route path="/projects" element={<Stub title="Projects" />} />
        <Route path="/workboard" element={<WorkboardPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/evidence" element={<EvidencePage />} />
        <Route path="/analytics" element={<Stub title="Analytics" />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}
