import { registerFileHandlers } from './file'
import { registerFfmpegHandlers } from './ffmpeg'
import { registerFsHandlers } from './fs'

export function registerIpcHandlers(): void {
  registerFileHandlers()
  registerFfmpegHandlers()
  registerFsHandlers()
}
