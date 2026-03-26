import { registerProjectHandlers } from './project'
import { registerFfmpegHandlers } from './ffmpeg'
import { registerStreamHandlers } from './stream'

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerFfmpegHandlers()
  registerStreamHandlers()
}
