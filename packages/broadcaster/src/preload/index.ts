import { contextBridge } from 'electron'
import { broadcasterApi } from './api'

contextBridge.exposeInMainWorld('octanis', broadcasterApi)
