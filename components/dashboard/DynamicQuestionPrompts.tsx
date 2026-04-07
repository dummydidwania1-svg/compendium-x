'use client'

type DynamicQuestionPromptsProps = {
  visible: boolean
  prompts: string[]
  onSelect: (prompt: string) => void
}

export function DynamicQuestionPrompts({ visible, prompts, onSelect }: DynamicQuestionPromptsProps) {
  if (!visible) return null

  return (
    <div className="pointer-events-auto absolute bottom-[110%] right-0 mb-2 flex flex-col items-end gap-2">
      {prompts.map((prompt, index) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="animate-rise whitespace-nowrap rounded-full border border-[#5C4033]/10 bg-[#D9D0C4]/80 px-3 py-1.5 text-[10px] font-medium text-[#3B2F2F] shadow-sm backdrop-blur-md transition-all hover:bg-[#F0EBE3] hover:shadow-md"
          style={{
            animationDelay: `${(prompts.length - index) * 50}ms`,
            animationDuration: '0.4s',
          }}
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
