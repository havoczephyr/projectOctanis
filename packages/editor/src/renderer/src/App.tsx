import React from 'react'
import { AppShell } from './components/layout/AppShell'
import { useUiStore } from './store/uiStore'

export default function App(): React.ReactElement {
  const theme = useUiStore((s) => s.theme)

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return <AppShell />
}
