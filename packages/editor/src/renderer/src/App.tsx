import React from 'react'
import { AppShell } from './components/layout/AppShell'
import { UndoHistoryPanel } from './components/UndoHistoryPanel'
import { ClipContextMenu } from './components/timeline/ClipContextMenu'
import { FadeGainEditor } from './components/FadeGainEditor'
import { ShortcutPrompt } from './components/ShortcutPrompt'
import { SplashScreen } from './components/splash/SplashScreen'
import { useUiStore } from './store/uiStore'
import { useProjectStore } from './store/projectStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useMenuActions } from './hooks/useMenuActions'

export default function App(): React.ReactElement {
  const theme = useUiStore((s) => s.theme)
  const uiIntensity = useUiStore((s) => s.uiIntensity)
  const isProjectOpen = useProjectStore((s) => s.isProjectOpen)

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  React.useEffect(() => {
    document.documentElement.setAttribute('data-ui-intensity', uiIntensity)
  }, [uiIntensity])

  useKeyboardShortcuts()
  useMenuActions()

  if (!isProjectOpen) {
    return <SplashScreen />
  }

  return (
    <>
      <AppShell />
      <UndoHistoryPanel />
      <ClipContextMenu />
      <FadeGainEditor />
      <ShortcutPrompt />
    </>
  )
}
