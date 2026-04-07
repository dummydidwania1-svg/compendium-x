type DrillDownItem = {
  label: string
  score: number
}

type DrillDownSection = {
  title: string
  items: DrillDownItem[]
}

type DrillDownPanelProps = {
  title: string
  sections: DrillDownSection[]
  onBack: () => void
}

export function DrillDownPanel({ title, sections, onBack }: DrillDownPanelProps) {
  return (
    <div className="animate-rise rounded-xl border border-[#5C4033]/15 bg-[#F0EBE3]/70 p-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#5C4033]/70 transition hover:text-[#3B2F2F]"
      >
        ← Back
      </button>
      <h4 className="font-serif text-lg font-semibold text-[#3B2F2F]">{title}</h4>

      <div className="mt-4 space-y-4">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C4033]/60">{section.title}</p>
            <div className="mt-2 space-y-2">
              {section.items.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm text-[#3B2F2F]">
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.score}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#D9D0C4]/65">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-[#5C4033] to-[#5BAFCC]"
                      style={{ width: `${Math.max(6, Math.min(100, item.score))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
