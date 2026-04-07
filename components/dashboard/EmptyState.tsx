import { LockIcon } from './icons'

type EmptyStateProps = {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-[#5C4033]/20 bg-[#F0EBE3]/55 p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#5C4033]/20 bg-[#D9D0C4]/35 text-[#5C4033]/70">
        <LockIcon className="h-5 w-5" />
      </div>
      <p className="font-serif text-base font-semibold text-[#3B2F2F]">{title}</p>
      <p className="mt-1 text-sm text-[#5C4033]/70">{description}</p>
    </div>
  )
}
