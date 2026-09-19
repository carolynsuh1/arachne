import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

export type OrgNodeType = Node<
  {
    name: string
    org_type?: string | null
    description?: string | null
  },
  "organization"
>

export function OrgNode({ data }: NodeProps<OrgNodeType>) {
  return (
    <div className="min-w-44 max-w-56 rounded-md border border-stone-500 bg-stone-900 px-3 py-2 text-[#fbf7f0] shadow-sm">
      <Handle type="target" position={Position.Left} />
      <p className="font-sans text-[10px] tracking-wide text-stone-400 uppercase">
        {data.org_type || "Organization"}
      </p>
      <p className="mt-1 text-sm leading-tight">{data.name}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
