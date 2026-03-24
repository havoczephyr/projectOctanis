import React from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'

export function UndoHistoryPanel(): React.ReactElement | null {
  const show = useUiStore((s) => s.showUndoHistoryPanel)
  const setShow = useUiStore((s) => s.setShowUndoHistoryPanel)

  const temporalState = useProjectStore.temporal.getState()
  const pastCount = temporalState.pastStates.length
  const futureCount = temporalState.futureStates.length

  if (!show) return null

  function handleUndo(): void {
    useProjectStore.temporal.getState().undo()
  }

  function handleRedo(): void {
    useProjectStore.temporal.getState().redo()
  }

  function handleJumpTo(index: number): void {
    const temporal = useProjectStore.temporal.getState()
    const currentPastCount = temporal.pastStates.length
    const stepsBack = currentPastCount - index
    if (stepsBack > 0) {
      for (let i = 0; i < stepsBack; i++) {
        temporal.undo()
      }
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        right: 20,
        width: 260,
        maxHeight: 400,
        background: 'rgba(20, 20, 30, 0.95)',
        border: '1px solid rgba(0, 255, 204, 0.2)',
        borderRadius: 8,
        padding: 12,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#ccc',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#00FFCC', fontWeight: 600, fontSize: 12 }}>Undo History</span>
        <button
          onClick={() => setShow(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: 14,
            padding: '0 4px',
          }}
        >
          x
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleUndo}
          disabled={pastCount === 0}
          style={{
            flex: 1,
            padding: '4px 8px',
            background: pastCount > 0 ? 'rgba(0, 255, 204, 0.1)' : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(0, 255, 204, 0.2)',
            borderRadius: 4,
            color: pastCount > 0 ? '#00FFCC' : '#555',
            cursor: pastCount > 0 ? 'pointer' : 'default',
            fontSize: 10,
            fontFamily: 'monospace',
          }}
        >
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={futureCount === 0}
          style={{
            flex: 1,
            padding: '4px 8px',
            background: futureCount > 0 ? 'rgba(0, 255, 204, 0.1)' : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(0, 255, 204, 0.2)',
            borderRadius: 4,
            color: futureCount > 0 ? '#00FFCC' : '#555',
            cursor: futureCount > 0 ? 'pointer' : 'default',
            fontSize: 10,
            fontFamily: 'monospace',
          }}
        >
          Redo
        </button>
      </div>

      <div
        style={{
          overflowY: 'auto',
          maxHeight: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {/* Current state */}
        <div
          style={{
            padding: '4px 8px',
            background: 'rgba(0, 255, 204, 0.15)',
            borderRadius: 3,
            color: '#00FFCC',
            fontSize: 10,
          }}
        >
          Current state
        </div>

        {/* Past states (most recent first) */}
        {Array.from({ length: pastCount }).map((_, i) => {
          const index = pastCount - 1 - i
          return (
            <div
              key={index}
              onClick={() => handleJumpTo(index)}
              style={{
                padding: '4px 8px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 10,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 204, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
              }}
            >
              State change #{index + 1}
            </div>
          )
        })}

        {pastCount === 0 && (
          <div style={{ padding: '8px', color: '#555', textAlign: 'center', fontSize: 10 }}>
            No history yet
          </div>
        )}
      </div>
    </div>
  )
}
