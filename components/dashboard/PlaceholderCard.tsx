type PlaceholderCardProps = {
  title: string
}

export function PlaceholderCard({ title }: PlaceholderCardProps) {
  return (
    <article className="glass-card flex min-h-[100px] items-center justify-center border-2 border-dashed border-[#5C4033]/20 bg-[#F0EBE3]/40 p-4">
      <span className="text-center text-xs font-medium text-[#5C4033]/40">
        {title || 'Metric coming soon'}
      </span>
    </article>
  )
}
