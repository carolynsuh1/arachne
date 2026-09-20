import { useEffect, useMemo } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
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
  activeNodeId?: string | null
  activeEdgeId?: string | null
  activeNote?: string
}

export function RelationshipGraph({
  nodes,
  edges,
  onSelect,
  activeNodeId,
  activeEdgeId,
  activeNote,
}: Props) {
  const flowNodes: Node[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          ...node.data,
          voiceActive: node.id === activeNodeId,
          voiceNote: node.id === activeNodeId ? activeNote : undefined,
        },
      })),
    [nodes, activeNodeId, activeNote],
  )

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: edge.data.strength >= 0.8 || edge.id === activeEdgeId,
        style:
          edge.id === activeEdgeId
            ? { stroke: "#b45309", strokeWidth: 4 }
            : undefined,
      })),
    [edges, activeEdgeId],
  )

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setRfNodes(flowNodes)
    setRfEdges(flowEdges)
  }, [flowNodes, flowEdges, setRfNodes, setRfEdges])

  return (
    <div className="h-[70vh] overflow-hidden rounded-xl border border-stone-300 bg-[#fbf7f0]">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
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
