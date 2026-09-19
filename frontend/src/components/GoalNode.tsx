import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

export type GoalNodeType = Node<
  {
    name: string
    description?: string | null
  },
  "goal"
>

export function GoalNode({ data }: NodeProps<GoalNodeType>) {
  return (
    <div className="min-w-52 max-w-64 rounded-full border border-amber-800 bg-amber-100 px-4 py-3 text-center shadow-sm">
      <Handle type="target" position={Position.Top} />
      <p className="font-sans text-[10px] tracking-wide text-amber-900 uppercase">
        Goal
      </p>
      <p className="mt-1 text-sm leading-tight">{data.description || data.name}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
