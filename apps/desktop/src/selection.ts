export interface FlowSelection {
  nodeIds: string[]
  edgeIds: string[]
  primaryNodeId?: string
  primaryEdgeId?: string
}

/**
 * Vue Flow is the authority for the current selection. A primary selection is
 * only exposed when exactly one element remains selected; this prevents a
 * previously clicked element from leaking back into multi-selection actions.
 */
export function resolveFlowSelection(nodeIds: string[], edgeIds: string[]): FlowSelection {
  const uniqueNodeIds = [...new Set(nodeIds)]
  const uniqueEdgeIds = [...new Set(edgeIds)]
  const selection: FlowSelection = { nodeIds: uniqueNodeIds, edgeIds: uniqueEdgeIds }
  if (uniqueNodeIds.length + uniqueEdgeIds.length !== 1) return selection
  if (uniqueNodeIds.length === 1) selection.primaryNodeId = uniqueNodeIds[0]
  else selection.primaryEdgeId = uniqueEdgeIds[0]
  return selection
}
