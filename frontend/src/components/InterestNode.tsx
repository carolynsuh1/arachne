import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

export type InterestNodeType = Node<
  {
    name: string
    relevant?: boolean
  },
  "interest"
>

export function InterestNode({ data }: NodeProps<InterestNodeType>) {
  return (
    <div
      className={`min-w-32 rounded-full border px-3 py-1.5 text-center ${
        data.relevant
          ? "border-stone-800 bg-white"
          : "border-stone-300 bg-stone-100"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <p className="font-sans text-[10px] tracking-wide text-stone-500 uppercase">
        Interest
      </p>
      <p className="text-sm leading-tight">{data.name}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
