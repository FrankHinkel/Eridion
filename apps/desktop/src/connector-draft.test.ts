import { beforeEach, describe, expect, it } from 'vitest'
import { cancelConnector, connectorHover, connectorPointer, connectorSource, setConnectorHover, startConnector, takeConnectorTarget } from './connector-draft'

describe('connector drag state', () => {
  beforeEach(cancelConnector)

  it('always clears a connector after an invalid drop', () => {
    startConnector({ nodeId: 'a', anchor: { side: 'right', position: 0 } }, { x: 10, y: 20 })
    expect(takeConnectorTarget()).toBeUndefined()
    expect(connectorSource.value).toBeUndefined()
    expect(connectorHover.value).toBeUndefined()
    expect(connectorPointer.value).toBeUndefined()
  })

  it('returns source and target once for a valid drag', () => {
    startConnector({ nodeId: 'a', anchor: { side: 'right', position: 0 } }, { x: 10, y: 20 })
    setConnectorHover({ nodeId: 'b', anchor: { side: 'left', position: 0.25 } })
    expect(takeConnectorTarget()).toEqual({
      source: { nodeId: 'a', anchor: { side: 'right', position: 0 } },
      target: { nodeId: 'b', anchor: { side: 'left', position: 0.25 } }
    })
    expect(takeConnectorTarget()).toBeUndefined()
  })

  it('allows a connector to return to another anchor of the same table', () => {
    startConnector({ nodeId: 'a', anchor: { side: 'left', position: -0.5 } }, { x: 10, y: 20 })
    setConnectorHover({ nodeId: 'a', anchor: { side: 'right', position: 0.5 } })

    expect(takeConnectorTarget()).toEqual({
      source: { nodeId: 'a', anchor: { side: 'left', position: -0.5 } },
      target: { nodeId: 'a', anchor: { side: 'right', position: 0.5 } }
    })
  })

  it('does not create a self-connector when the pointer never leaves its starting anchor', () => {
    startConnector({ nodeId: 'a', anchor: { side: 'left', position: -0.5, columnId: 'parent' } }, { x: 10, y: 20 })
    setConnectorHover({ nodeId: 'a', anchor: { side: 'left', position: -0.5, columnId: 'parent' } })

    expect(takeConnectorTarget()).toBeUndefined()
  })
})
