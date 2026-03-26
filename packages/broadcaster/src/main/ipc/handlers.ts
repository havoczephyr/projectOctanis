import { registerProjectHandlers } from './project'
import { registerFfmpegHandlers } from './ffmpeg'

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerFfmpegHandlers()
}
