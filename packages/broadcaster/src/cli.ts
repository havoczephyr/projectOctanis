import { ProjectLoader } from './ProjectLoader.js'
import { LoopExpander } from './LoopExpander.js'
import { Mixer } from './Mixer.js'
import { LocalPlayer } from './LocalPlayer.js'

export async function playCommand(projectFilePath: string): Promise<void> {
  console.log(`[octanis] Loading project: ${projectFilePath}`)
  const projectFile = await ProjectLoader.load(projectFilePath)

  console.log(`[octanis] Expanding loops...`)
  const expanded = LoopExpander.expand(projectFile)

  console.log(`[octanis] Building mix...`)
  const pcmStream = Mixer.getPCMStream(expanded)

  console.log(`[octanis] Playing through local audio...`)
  await LocalPlayer.play(pcmStream, { sampleRate: 44100, channels: 2, bitDepth: 16 })

  console.log(`[octanis] Playback complete.`)
}
