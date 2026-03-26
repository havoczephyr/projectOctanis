/**
 * Converts interleaved f32le PCM data into a planar Web Audio AudioBuffer.
 */
export function pcmToAudioBuffer(
  ctx: AudioContext,
  pcmData: ArrayBuffer,
  sampleRate: number,
  channels: number
): AudioBuffer {
  const float32 = new Float32Array(pcmData)
  const samplesPerChannel = Math.floor(float32.length / channels)
  const buffer = ctx.createBuffer(channels, samplesPerChannel, sampleRate)
  for (let ch = 0; ch < channels; ch++) {
    const channelData = buffer.getChannelData(ch)
    for (let i = 0; i < samplesPerChannel; i++) {
      channelData[i] = float32[i * channels + ch]
    }
  }
  return buffer
}
