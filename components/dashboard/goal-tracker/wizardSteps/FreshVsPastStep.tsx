'use client';

/**
 * New wizard step (§6): "Start fresh from today" vs "Count my past cases (N
 * would count)." Inserted right after the total is known (either typed via
 * enterTotal or auto-calculated in enterRecurring) and before askPerType.
 * Renders via the same OptionList visual pattern already used elsewhere in
 * the wizard (passed in as a prop rather than imported, since OptionList is
 * still module-local to GoalTracker.tsx).
 */
export default function FreshVsPastStep({
  pastCasesCount,
  OptionList,
  onChoose,
}: {
  pastCasesCount: number
  OptionList: React.ComponentType<{ options: { label: string; sub?: string; onClick: () => void }[] }>
  onChoose: (countPastCases: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[#3B2F2F]/70 leading-relaxed">
        Should your goal count cases you've already done, or start counting from today?
      </p>
      <OptionList
        options={[
          {
            label: 'Start fresh from today',
            sub: 'Only cases from now on count toward this goal.',
            onClick: () => onChoose(false),
          },
          {
            label: 'Count my past cases',
            sub: `${pastCasesCount} would count already.`,
            onClick: () => onChoose(true),
          },
        ]}
      />
    </div>
  )
}
