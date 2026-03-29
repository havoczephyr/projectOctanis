import { registerProjectHandlers } from './project'
import { registerFfmpegHandlers } from './ffmpeg'
import { registerRtpHandlers } from './rtp'
import { registerOpusHandlers } from './opus'

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerFfmpegHandlers()
  registerRtpHandlers()
  registerOpusHandlers()
}
