import { describe, it, expect, beforeEach } from 'vitest'
import { useBroadcasterStore } from './broadcasterStore'
import type { OctanisProjectFile } from '@octanis/shared'

function makeProject(): OctanisProjectFile {
  return {
    version: '0.1.0',
    audioFiles: {},
    project: {
      meta: { title: 'Test', bpm: 120 },
      durationSec: 60,
      tracks: [],
    },
  } as OctanisProjectFile
}

describe('broadcasterStore', () => {
  beforeEach(() => {
    // Reset to initial state
    useBroadcasterStore.setState({
      projectFile: null,
      currentFilePath: null,
      transportState: 'stopped',
      playheadSec: 0,
      sfuConfig: null,
      streamStatus: { connectionState: 'disconnected', serverUrl: null, roomName: null, participantCount: 0, uptimeSec: 0 },
      masterVolume: 1.0,
      micActive: false,
      micDuckAmount: 0.7,
      micThreshold: -30,
      duckAttackMs: 50,
      duckReleaseMs: 300,
    })
  })

  describe('project', () => {
    it('sets project and file path', () => {
      const project = makeProject()
      useBroadcasterStore.getState().setProject(project, '/test/path.octanis.json')

      const state = useBroadcasterStore.getState()
      expect(state.projectFile).toBe(project)
      expect(state.currentFilePath).toBe('/test/path.octanis.json')
    })

    it('clears project and resets transport', () => {
      useBroadcasterStore.getState().setProject(makeProject(), '/test/path.octanis.json')
      useBroadcasterStore.getState().play()
      useBroadcasterStore.getState().setPlayhead(42)

      useBroadcasterStore.getState().clearProject()

      const state = useBroadcasterStore.getState()
      expect(state.projectFile).toBeNull()
      expect(state.currentFilePath).toBeNull()
      expect(state.transportState).toBe('stopped')
      expect(state.playheadSec).toBe(0)
    })
  })

  describe('transport', () => {
    it('starts in stopped state', () => {
      expect(useBroadcasterStore.getState().transportState).toBe('stopped')
    })

    it('transitions to playing', () => {
      useBroadcasterStore.getState().play()
      expect(useBroadcasterStore.getState().transportState).toBe('playing')
    })

    it('transitions to paused', () => {
      useBroadcasterStore.getState().play()
      useBroadcasterStore.getState().pause()
      expect(useBroadcasterStore.getState().transportState).toBe('paused')
    })

    it('stop resets to stopped and clears playhead', () => {
      useBroadcasterStore.getState().play()
      useBroadcasterStore.getState().setPlayhead(30)
      useBroadcasterStore.getState().stop()

      const state = useBroadcasterStore.getState()
      expect(state.transportState).toBe('stopped')
      expect(state.playheadSec).toBe(0)
    })

    it('sets playhead position', () => {
      useBroadcasterStore.getState().setPlayhead(15.5)
      expect(useBroadcasterStore.getState().playheadSec).toBe(15.5)
    })
  })

  describe('stream status', () => {
    it('starts with default disconnected status', () => {
      const status = useBroadcasterStore.getState().streamStatus
      expect(status.connectionState).toBe('disconnected')
      expect(status.serverUrl).toBeNull()
      expect(status.roomName).toBeNull()
      expect(status.participantCount).toBe(0)
    })

    it('updates stream status', () => {
      useBroadcasterStore.getState().setStreamStatus({
        connectionState: 'connected',
        serverUrl: 'wss://test.server/janus',
        roomName: 'Room 1234',
        participantCount: 5,
        uptimeSec: 120,
      })

      const status = useBroadcasterStore.getState().streamStatus
      expect(status.connectionState).toBe('connected')
      expect(status.serverUrl).toBe('wss://test.server/janus')
      expect(status.roomName).toBe('Room 1234')
      expect(status.participantCount).toBe(5)
      expect(status.uptimeSec).toBe(120)
    })
  })

  describe('sfu config', () => {
    it('starts with null config', () => {
      expect(useBroadcasterStore.getState().sfuConfig).toBeNull()
    })

    it('sets sfu config', () => {
      useBroadcasterStore.getState().setSfuConfig({
        provider: 'janus',
        serverUrl: 'wss://test.server/janus',
        roomId: 1234,
        secret: 'mysecret',
      })

      const config = useBroadcasterStore.getState().sfuConfig
      expect(config?.provider).toBe('janus')
      if (config?.provider === 'janus') {
        expect(config.serverUrl).toBe('wss://test.server/janus')
        expect(config.roomId).toBe(1234)
        expect(config.secret).toBe('mysecret')
      }
    })
  })

  describe('master volume', () => {
    it('defaults to 1.0', () => {
      expect(useBroadcasterStore.getState().masterVolume).toBe(1.0)
    })

    it('sets volume', () => {
      useBroadcasterStore.getState().setMasterVolume(0.5)
      expect(useBroadcasterStore.getState().masterVolume).toBe(0.5)
    })

    it('clamps to 0-1', () => {
      useBroadcasterStore.getState().setMasterVolume(-0.5)
      expect(useBroadcasterStore.getState().masterVolume).toBe(0)
      useBroadcasterStore.getState().setMasterVolume(1.5)
      expect(useBroadcasterStore.getState().masterVolume).toBe(1)
    })
  })

  describe('microphone settings', () => {
    it('toggles mic active', () => {
      useBroadcasterStore.getState().setMicActive(true)
      expect(useBroadcasterStore.getState().micActive).toBe(true)

      useBroadcasterStore.getState().setMicActive(false)
      expect(useBroadcasterStore.getState().micActive).toBe(false)
    })

    it('sets duck amount', () => {
      useBroadcasterStore.getState().setMicDuckAmount(0.5)
      expect(useBroadcasterStore.getState().micDuckAmount).toBe(0.5)
    })

    it('sets threshold', () => {
      useBroadcasterStore.getState().setMicThreshold(-20)
      expect(useBroadcasterStore.getState().micThreshold).toBe(-20)
    })

    it('sets duck attack', () => {
      useBroadcasterStore.getState().setDuckAttackMs(100)
      expect(useBroadcasterStore.getState().duckAttackMs).toBe(100)
    })

    it('sets duck release', () => {
      useBroadcasterStore.getState().setDuckReleaseMs(500)
      expect(useBroadcasterStore.getState().duckReleaseMs).toBe(500)
    })
  })
})
