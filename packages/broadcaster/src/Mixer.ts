import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { type Readable } from 'stream'
import type { OctanisProjectFile, Clip } from '@octanis/shared'
import { EnvelopeMapper } from './EnvelopeMapper.js'

export interface PCMStreamOptions {
  sampleRate?: number
  channels?: number
  format?: 's16le' | 'f32le'
}

export const Mixer = {
  getPCMStream(
    projectFile: OctanisProjectFile,
    options: PCMStreamOptions = {}
  ): Readable {
    const { sampleRate = 44100, channels = 2, format = 's16le' } = options
    const { tracks, masterVolume, durationSec } = projectFile.project
    const audioFiles = projectFile.audioFiles

    // Collect all (input file, clip) pairs
    const inputs: Array<{ path: string; clip: Clip; trackVolume: number; durationSec: number }> = []

    for (const track of tracks) {
      if (track.muted) continue
      for (const clip of track.clips) {
        const audioFile = audioFiles[clip.audioFileId]
        if (!audioFile) continue
        const clipDur =
          clip.trimEndSec != null
            ? clip.trimEndSec - clip.trimStartSec
            : audioFile.durationSec
        inputs.push({
          path: audioFile.absolutePath,
          clip,
          trackVolume: track.volume,
          durationSec: clipDur,
        })
      }
    }

    if (inputs.length === 0) {
      // Return a silent stream: generate silence for durationSec
      return ffmpeg()
        .setFfmpegPath(ffmpegStatic as string)
        .input(`anullsrc=r=${sampleRate}:cl=stereo`)
        .inputOptions(['-f', 'lavfi'])
        .outputOptions([
          '-t', String(durationSec),
          '-ac', String(channels),
          '-ar', String(sampleRate),
          '-f', format,
        ])
        .pipe() as Readable
    }

    const cmd = ffmpeg().setFfmpegPath(ffmpegStatic as string)

    // Add all input files
    for (const { path, clip } of inputs) {
      cmd.input(path)
      if (clip.trimStartSec > 0) {
        cmd.inputOptions([`-ss`, String(clip.trimStartSec)])
      }
      if (clip.trimEndSec != null) {
        cmd.inputOptions([`-to`, String(clip.trimEndSec)])
      }
    }

    // Build filter_complex
    const filterParts: string[] = []
    const mixInputs: string[] = []

    inputs.forEach(({ clip, trackVolume, durationSec: clipDur }, i) => {
      const envelopeFilters = EnvelopeMapper.buildFilters(clip, clipDur, clip.startSec)

      // adelay positions clip on the timeline
      const delayMs = Math.round(clip.startSec * 1000)
      const delayStr = `${delayMs}|${delayMs}`

      const chainParts: string[] = [
        `[${i}:a]`,
        `aformat=channel_layouts=stereo`,
        `adelay=${delayStr}`,
      ]

      if (envelopeFilters.length > 0) {
        chainParts.push(...envelopeFilters)
      }

      // Track volume
      if (trackVolume !== 1.0) {
        chainParts.push(`volume=${trackVolume.toFixed(4)}`)
      }

      const label = `[clip${i}]`
      filterParts.push(`${chainParts.join(',')},apad${label}`)
      mixInputs.push(label)
    })

    // Mix all clips together
    filterParts.push(
      `${mixInputs.join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0,` +
        `volume=${masterVolume.toFixed(4)},` +
        `atrim=duration=${durationSec}` +
        `[master]`
    )

    cmd.complexFilter(filterParts)
    cmd.map('[master]')

    cmd.outputOptions([
      '-ac', String(channels),
      '-ar', String(sampleRate),
      '-f', format,
    ])

    return cmd.pipe() as Readable
  },
}
