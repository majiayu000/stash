// tweaks.jsx — the user-facing Tweaks panel for the workbench design.
// Exposes global theme switching (persisted to localStorage via window.setTheme)
// and a handful of ambient-effect toggles. Mounted as a sibling of the canvas
// at the bottom of the React tree.

function WorkbenchTweaks() {
  const [theme, setThemeState] = React.useState(() => window.getTheme());

  // Listen for theme changes from anywhere (Settings page, programmatic)
  React.useEffect(() => {
    const handler = (e) => setThemeState(e.detail.theme);
    window.addEventListener('themechange', handler);
    return () => window.removeEventListener('themechange', handler);
  }, []);

  const setTheme = (next) => {
    window.setTheme(next);
    setThemeState(next);
  };

  const themeOptions = [
    { value: 'cyber',     label: '🌌 Cyber neon' },
    { value: 'matrix',    label: '🟢 Matrix' },
    { value: 'synthwave', label: '🌆 Synthwave' },
    { value: 'amber',     label: '🔶 Amber CRT' },
    { value: 'glacier',   label: '❄️ Glacier' },
    { value: 'paper',     label: '📄 Paper · GitHub' },
    { value: 'mono',      label: '⬛ Mono · typewriter' },
  ];

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Global theme">
        <TweakSelect
          label="theme"
          value={theme}
          options={themeOptions}
          onChange={setTheme}
        />
        <div className="theme-swatch-row">
          {themeOptions.map(t => (
            <button
              key={t.value}
              className={`theme-quick-swatch ${theme === t.value ? 'active' : ''}`}
              onClick={() => setTheme(t.value)}
              title={t.label}
              data-theme-preview={t.value}
            >
              <span className="theme-swatch-dot" data-pal={t.value}/>
            </button>
          ))}
        </div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:'var(--text-muted)',padding:'4px 2px 0',lineHeight:1.5}}>
          applies globally · persists across reloads
        </div>
      </TweakSection>

      <TweakSection label="Default view">
        <TweakRadio
          label="open to"
          value="capture"
          options={[
            { value: 'capture', label: 'Capture' },
            { value: 'wall',    label: 'Wall' },
            { value: 'mission', label: 'Mission' },
          ]}
          onChange={() => {}}
        />
      </TweakSection>

      <TweakSection label="Ambient effects">
        <TweakToggle label="cursor glow"   value={true}  onChange={() => {}} />
        <TweakToggle label="particles"     value={true}  onChange={() => {}} />
        <TweakToggle label="typewriter"    value={true}  onChange={() => {}} />
        <TweakToggle label="dim at night"  value={false} onChange={() => {}} />
      </TweakSection>

      <TweakSection label="Density">
        <TweakRadio
          label="size"
          value="comfortable"
          options={[
            { value: 'compact',     label: 'Compact' },
            { value: 'comfortable', label: 'Normal' },
            { value: 'spacious',    label: 'Spacious' },
          ]}
          onChange={() => {}}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

// Mount the tweaks panel beside the design canvas. The host's __activate_edit_mode
// message is what actually opens it — until then it's invisible.
(function() {
  const mountTweaks = () => {
    if (!window.TweaksPanel || !window.React) {
      setTimeout(mountTweaks, 60);
      return;
    }
    const el = document.createElement('div');
    el.id = 'tweaks-mount';
    document.body.appendChild(el);
    ReactDOM.createRoot(el).render(<WorkbenchTweaks />);
  };
  mountTweaks();
})();
