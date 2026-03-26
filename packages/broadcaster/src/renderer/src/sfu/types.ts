import type { SfuConnectionState } from '../../../ipcTypes'

export interface SfuProvider {
  readonly name: string
  connect(track: MediaStreamTrack): Promise<void>
  disconnect(): Promise<void>
  onStateChange(cb: (state: SfuConnectionState) => void): void
  onParticipantCount(cb: (count: number) => void): void
  dispose(): void
}
