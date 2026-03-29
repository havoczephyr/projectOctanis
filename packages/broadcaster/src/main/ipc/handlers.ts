import { registerProjectHandlers } from './project'
import { registerFfmpegHandlers } from './ffmpeg'
import { registerRtpHandlers } from './rtp'

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerFfmpegHandlers()
  registerRtpHandlers()
}
