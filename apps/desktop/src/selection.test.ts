import { describe, expect, it } from 'vitest'
import { resolveFlowSelection } from './selection'

describe('flow selection', () => {
  it('uses the remaining Vue Flow selection after Cmd-click deselection', () => {
    expect(resolveFlowSelection(['a', 'b', 'c'], [])).toEqual({
      nodeIds: ['a', 'b', 'c'], edgeIds: []
    })

    // b was most recently clicked, but is now deselected and must not become
    // an implicit deletion candidate through a stale primary selection.
    expect(resolveFlowSelection(['a', 'c'], [])).toEqual({
      nodeIds: ['a', 'c'], edgeIds: []
    })
  })

  it('only exposes a primary element for an actual single selection', () => {
    expect(resolveFlowSelection(['a'], [])).toEqual({
      nodeIds: ['a'], edgeIds: [], primaryNodeId: 'a'
    })
    expect(resolveFlowSelection([], ['edge-a'])).toEqual({
      nodeIds: [], edgeIds: ['edge-a'], primaryEdgeId: 'edge-a'
    })
    expect(resolveFlowSelection([], [])).toEqual({ nodeIds: [], edgeIds: [] })
  })
})
