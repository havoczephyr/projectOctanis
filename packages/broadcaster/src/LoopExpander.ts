import type { OctanisProjectFile, Clip } from '@octanis/shared'
import { nanoid } from 'nanoid'

/**
 * LoopExpander unrolls loop regions into concrete sequential clips.
 * Returns a new OctanisProjectFile with loops replaced by repeated clip segments.
 */
export const LoopExpander = {
  expand(projectFile: OctanisProjectFile): OctanisProjectFile {
    const audioFiles = projectFile.audioFiles
    const expandedTracks = projectFile.project.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => expandClip(clip, audioFiles)),
    }))

    return {
      ...projectFile,
      project: {
        ...projectFile.project,
        tracks: expandedTracks,
      },
    }
  },
}

function expandClip(
  clip: Clip,
  audioFiles: OctanisProjectFile['audioFiles']
): Clip[] {
  if (!clip.loop) return [clip]

  const audioFile = audioFiles[clip.audioFileId]
  const clipDurationSec =
    clip.trimEndSec != null
      ? clip.trimEndSec - clip.trimStartSec
      : audioFile?.durationSec ?? 0

  const { startSec: loopStart, endSec: loopEnd, count } = clip.loop
  const loopDuration = loopEnd - loopStart

  if (loopDuration <= 0) return [clip]

  // First: the pre-loop portion (before loopStart)
  const result: Clip[] = []

  if (loopStart > 0) {
    result.push({
      ...clip,
      id: nanoid(),
      trimEndSec: clip.trimStartSec + loopStart,
      loop: null,
    })
  }

  // Loop iterations
  const maxIterations = count === 'infinite' ? 9999 : count
  const projectDuration = 9999 // Will be bounded by project durationSec during mixing

  let currentStart = clip.startSec + loopStart

  for (let i = 0; i < maxIterations; i++) {
    if (currentStart >= projectDuration) break

    result.push({
      ...clip,
      id: nanoid(),
      startSec: currentStart,
      trimStartSec: clip.trimStartSec + loopStart,
      trimEndSec: clip.trimStartSec + loopEnd,
      loop: null,
    })

    currentStart += loopDuration
  }

  // Post-loop portion (after loop end, within original clip)
  if (loopEnd < clipDurationSec) {
    result.push({
      ...clip,
      id: nanoid(),
      startSec: currentStart,
      trimStartSec: clip.trimStartSec + loopEnd,
      trimEndSec: clip.trimEndSec,
      loop: null,
    })
  }

  return result
}
