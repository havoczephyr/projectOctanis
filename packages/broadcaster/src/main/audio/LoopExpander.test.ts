import { describe, it, expect } from 'vitest'
import { LoopExpander } from './LoopExpander'
import type { OctanisProjectFile, Clip } from '@octanis/shared'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    audioFileId: 'af-1',
    startSec: 0,
    trimStartSec: 0,
    trimEndSec: 10,
    volume: 1.0,
    fadeRegions: [],
    muteRegions: [],
    loop: null,
    ...overrides,
  }
}

function makeProject(clips: Clip[]): OctanisProjectFile {
  return {
    version: '0.1.0',
    audioFiles: {
      'af-1': {
        id: 'af-1',
        absolutePath: '/audio/test.wav',
        durationSec: 30,
        sampleRate: 44100,
        channels: 2,
      },
    },
    project: {
      meta: { title: 'Test', bpm: 120 },
      durationSec: 120,
      tracks: [
        {
          id: 'track-1',
          name: 'Track 1',
          volume: 1.0,
          clips,
        },
      ],
    },
  } as OctanisProjectFile
}

describe('LoopExpander', () => {
  it('returns project unchanged when no clips have loops', () => {
    const clip = makeClip()
    const project = makeProject([clip])
    const result = LoopExpander.expand(project)

    expect(result.project.tracks[0].clips).toHaveLength(1)
    expect(result.project.tracks[0].clips[0].id).toBe('clip-1')
  })

  it('expands a single clip with a finite loop', () => {
    const clip = makeClip({
      startSec: 0,
      trimStartSec: 0,
      trimEndSec: 10,
      loop: {
        startSec: 2,
        endSec: 6,
        count: 3,
      },
    })
    const project = makeProject([clip])
    const result = LoopExpander.expand(project)

    const clips = result.project.tracks[0].clips
    // pre-loop (0-2) + 3 loop iterations (2-6 each) + post-loop (6-10)
    expect(clips.length).toBe(5)

    // All expanded clips should have loop = null
    for (const c of clips) {
      expect(c.loop).toBeNull()
    }

    // Each expanded clip gets a unique ID
    const ids = new Set(clips.map((c) => c.id))
    expect(ids.size).toBe(clips.length)
  })

  it('handles loop with no pre-loop portion', () => {
    const clip = makeClip({
      startSec: 0,
      trimStartSec: 0,
      trimEndSec: 10,
      loop: {
        startSec: 0,
        endSec: 5,
        count: 2,
      },
    })
    const project = makeProject([clip])
    const result = LoopExpander.expand(project)

    const clips = result.project.tracks[0].clips
    // no pre-loop + 2 loop iterations + post-loop (5-10)
    expect(clips.length).toBe(3)
  })

  it('handles loop covering full clip (no post-loop)', () => {
    const clip = makeClip({
      startSec: 0,
      trimStartSec: 0,
      trimEndSec: 10,
      loop: {
        startSec: 0,
        endSec: 10,
        count: 3,
      },
    })
    const project = makeProject([clip])
    const result = LoopExpander.expand(project)

    const clips = result.project.tracks[0].clips
    // no pre-loop + 3 loop iterations + no post-loop
    expect(clips.length).toBe(3)
  })

  it('expands multiple clips with loops independently', () => {
    const clip1 = makeClip({
      id: 'clip-1',
      startSec: 0,
      loop: { startSec: 0, endSec: 5, count: 2 },
    })
    const clip2 = makeClip({
      id: 'clip-2',
      startSec: 20,
      loop: { startSec: 1, endSec: 3, count: 4 },
    })
    const project = makeProject([clip1, clip2])
    const result = LoopExpander.expand(project)

    const clips = result.project.tracks[0].clips
    // clip1: 2 loop + 1 post = 3; clip2: 1 pre + 4 loop + 1 post = 6
    expect(clips.length).toBe(9)
  })

  it('returns clip unchanged when loop duration is zero', () => {
    const clip = makeClip({
      loop: { startSec: 5, endSec: 5, count: 3 },
    })
    const project = makeProject([clip])
    const result = LoopExpander.expand(project)

    expect(result.project.tracks[0].clips).toHaveLength(1)
  })

  it('sets correct startSec for sequential loop iterations', () => {
    const clip = makeClip({
      startSec: 10,
      loop: { startSec: 0, endSec: 4, count: 3 },
    })
    const project = makeProject([clip])
    const result = LoopExpander.expand(project)

    const clips = result.project.tracks[0].clips
    // Loop iterations at startSec: 10+0=10, 10+4=14, 10+8=18
    expect(clips[0].startSec).toBe(10)
    expect(clips[1].startSec).toBe(14)
    expect(clips[2].startSec).toBe(18)
  })

  it('does not mutate the original project', () => {
    const clip = makeClip({
      loop: { startSec: 0, endSec: 5, count: 2 },
    })
    const project = makeProject([clip])
    const originalClipsLength = project.project.tracks[0].clips.length

    LoopExpander.expand(project)

    expect(project.project.tracks[0].clips.length).toBe(originalClipsLength)
    expect(project.project.tracks[0].clips[0].loop).not.toBeNull()
  })
})
