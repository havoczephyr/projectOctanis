import React, { useEffect } from 'react'
import { useUiStore } from '../../store/uiStore'
import styles from './ToastMessage.module.css'

export function ToastMessage(): React.ReactElement | null {
  const toastMessage = useUiStore((s) => s.toastMessage)
  const clearToast = useUiStore((s) => s.clearToast)

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(clearToast, 2500)
    return () => clearTimeout(timer)
  }, [toastMessage, clearToast])

  if (!toastMessage) return null

  const isError = toastMessage.severity === 'error'

  return (
    <div className={`${styles.toast} ${isError ? styles.error : styles.info}`}>
      {toastMessage.text}
    </div>
  )
}
