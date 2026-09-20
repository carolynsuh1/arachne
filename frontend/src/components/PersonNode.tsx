import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

export type PersonNodeType = Node<
  {
    name: string
    bio?: string | null
    interests?: string[]
    skills?: string[]
    relevant?: boolean
    why?: string | null
    voiceActive?: boolean
    voiceNote?: string
    suggested?: boolean
  },
  "person"
>

export function PersonNode({ data }: NodeProps<PersonNodeType>) {
  return (
    <div
      className={`w-56 rounded-xl border px-3 py-2 text-center shadow-sm ${
        data.voiceActive
          ? "scale-110 border-amber-600 bg-amber-100 shadow-lg ring-4 ring-amber-300/60"
          : data.suggested
          ? "border-dashed border-sky-700 bg-sky-50"
          : data.relevant
          ? "border-amber-700 bg-amber-50"
          : "border-stone-800 bg-[#fbf7f0]"
      } transition-all duration-300`}
    >
      <Handle type="target" position={Position.Left} />
      <p className="truncate text-sm leading-tight">{data.name}</p>
      {data.suggested ? <p className="font-sans text-[10px] uppercase tracking-wide text-sky-700">Suggested</p> : null}
      {data.voiceActive && data.voiceNote ? (
        <p className="mt-1 line-clamp-3 text-left font-sans text-[10px] leading-snug text-stone-700">
          {data.voiceNote}
        </p>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
