import React from 'react'
import { AppShell } from './components/layout/AppShell'
import { UndoHistoryPanel } from './components/UndoHistoryPanel'
import { useUiStore } from './store/uiStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useMenuActions } from './hooks/useMenuActions'

export default function App(): React.ReactElement {
  const theme = useUiStore((s) => s.theme)

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useKeyboardShortcuts()
  useMenuActions()

  return (
    <>
      <AppShell />
      <UndoHistoryPanel />
    </>
  )
}
