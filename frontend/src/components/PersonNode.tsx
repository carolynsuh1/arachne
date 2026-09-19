import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

export type PersonNodeType = Node<
  {
    name: string
    bio?: string | null
    interests?: string[]
    skills?: string[]
    relevant?: boolean
    why?: string | null
  },
  "person"
>

export function PersonNode({ data }: NodeProps<PersonNodeType>) {
  return (
    <div
      className={`min-w-44 max-w-56 rounded-xl border px-3 py-2 shadow-sm ${
        data.relevant
          ? "border-amber-700 bg-amber-50"
          : "border-stone-800 bg-[#fbf7f0]"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <p className="font-sans text-[10px] tracking-wide text-stone-500 uppercase">
        Person
      </p>
      <p className="mt-1 text-sm leading-tight">{data.name}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
