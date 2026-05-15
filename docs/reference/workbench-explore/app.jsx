// app.jsx — Assemble the design canvas with the PRD + all concept artboards.

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="prd"
        title="Product requirements"
        subtitle="What we're building, for whom, and why"
      >
        <DCArtboard id="prd-doc" label="PRD · v0.1" width={920} height={1500}>
          <PRD />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="concepts"
        title="Concepts"
        subtitle="Six directions — E leads the recommendation, F shows the lifecycle"
      >
        <DCArtboard id="e" label="E · Capture & Plan (todo-first)" width={1440} height={980}>
          <ConceptE />
        </DCArtboard>
        <DCArtboard id="a" label="A · Card Wall" width={1440} height={980}>
          <ConceptA />
        </DCArtboard>
        <DCArtboard id="b" label="B · Mission Control" width={1440} height={980}>
          <ConceptB />
        </DCArtboard>
        <DCArtboard id="c" label="C · Hero + Stream" width={1440} height={980}>
          <ConceptC />
        </DCArtboard>
        <DCArtboard id="d" label="D · Constellation" width={1440} height={980}>
          <ConceptD />
        </DCArtboard>
        <DCArtboard id="f" label="F · Project lifecycle" width={1440} height={980}>
          <ConceptF />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="deep"
        title="Deep dives"
        subtitle="Detail views & power-user surfaces beneath the dashboard"
      >
        <DCArtboard id="g" label="G · Session detail" width={1440} height={980}>
          <ConceptG />
        </DCArtboard>
        <DCArtboard id="h" label="H · Cost & burn analytics" width={1440} height={1080}>
          <ConceptH />
        </DCArtboard>
        <DCArtboard id="i" label="I · ⌘K command palette" width={1440} height={980}>
          <ConceptI />
        </DCArtboard>
        <DCArtboard id="j" label="J · Weekly review" width={1440} height={1180}>
          <ConceptJ />
        </DCArtboard>
        <DCArtboard id="k" label="K · Project workbench (intent · milestones · notes · lessons · skills)" width={1440} height={1320}>
          <ConceptK />
        </DCArtboard>
        <DCArtboard id="m" label="M · Skills library" width={1440} height={1080}>
          <ConceptM />
        </DCArtboard>
        <DCArtboard id="l" label="L · Todo detail · split · promote" width={1440} height={980}>
          <ConceptL />
        </DCArtboard>
        <DCArtboard id="o" label="O · Start session dispatcher" width={1440} height={980}>
          <ConceptO />
        </DCArtboard>
        <DCArtboard id="n" label="N · Settings · themes · integrations" width={1440} height={1280}>
          <ConceptN />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="themes"
        title="Themes"
        subtitle="Same dashboard, five different paint jobs — switchable in settings"
      >
        <DCArtboard id="t-cyber" label="🌌 Cyber neon (default)" width={1440} height={980}>
          <ConceptE />
        </DCArtboard>
        <DCArtboard id="t-matrix" label="🟢 Matrix" width={1440} height={980}>
          <div className="theme-matrix" style={{height:'100%'}}><ConceptE /></div>
        </DCArtboard>
        <DCArtboard id="t-synth" label="🌆 Synthwave" width={1440} height={980}>
          <div className="theme-synthwave" style={{height:'100%'}}><ConceptE /></div>
        </DCArtboard>
        <DCArtboard id="t-amber" label="🔶 Amber CRT" width={1440} height={980}>
          <div className="theme-amber" style={{height:'100%'}}><ConceptE /></div>
        </DCArtboard>
        <DCArtboard id="t-glacier" label="❄️ Glacier (light)" width={1440} height={980}>
          <div className="theme-glacier" style={{height:'100%'}}><ConceptE /></div>
        </DCArtboard>
        <DCArtboard id="t-paper" label="📄 Paper (GitHub · square)" width={1440} height={980}>
          <div className="theme-paper" style={{height:'100%'}}><ConceptE /></div>
        </DCArtboard>
        <DCArtboard id="t-mono" label="⬛ Mono (typewriter)" width={1440} height={980}>
          <div className="theme-mono" style={{height:'100%'}}><ConceptE /></div>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
