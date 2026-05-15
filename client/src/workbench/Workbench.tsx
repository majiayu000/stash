import './styles/brand.css';
import './styles/dashboard.css';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { useWorkbenchData } from './useWorkbenchData';
import { ConceptE } from './concepts/ConceptE';

export function Workbench() {
  const { data, loading, error, reload } = useWorkbenchData();

  if (loading && !data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        loading workbench…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'var(--neon-pink)', fontFamily: 'var(--font-mono)' }}>
        Failed to load data: {error.message}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="workbench-shell">
      <div className="workbench-theme-floating">
        <ThemeSwitcher />
      </div>
      <ConceptE data={data} reload={reload} />

      <style>{`
        .workbench-shell {
          min-height: 100vh;
          padding: 1.5rem;
          position: relative;
        }
        .workbench-theme-floating {
          position: fixed;
          top: 16px;
          right: 24px;
          z-index: 50;
        }
        .dashboard-canvas {
          min-height: calc(100vh - 3rem);
          height: auto;
        }
        .dashboard-canvas .inner {
          height: auto !important;
          min-height: calc(100vh - 3rem);
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  );
}
