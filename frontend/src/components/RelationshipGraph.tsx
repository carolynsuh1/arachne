import { useMemo } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react"
import { GoalNode } from "./GoalNode"
import { InterestNode } from "./InterestNode"
import { OrgNode } from "./OrgNode"
import { PersonNode } from "./PersonNode"
import type { GraphEdge, GraphNode, GraphNodeData } from "../types"

const nodeTypes = {
  person: PersonNode,
  organization: OrgNode,
  interest: InterestNode,
  goal: GoalNode,
}

type Props = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onSelect: (node: GraphNodeData & { id: string }) => void
}

export function RelationshipGraph({ nodes, edges, onSelect }: Props) {
  const flowNodes: Node[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
    [nodes],
  )

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: edge.data.strength >= 0.8,
      })),
    [edges],
  )

  return (
    <div className="h-[70vh] overflow-hidden rounded-xl border border-stone-300 bg-[#fbf7f0]">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_event, node) =>
          onSelect({ id: node.id, ...(node.data as GraphNodeData) })
        }
      >
        <Background color="#d6d3d1" gap={18} />
        <MiniMap />
        <Controls />
      </ReactFlow>
    </div>
  )
}
