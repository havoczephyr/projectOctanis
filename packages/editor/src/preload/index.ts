import { contextBridge } from 'electron'
import { octanisApi } from './api'

contextBridge.exposeInMainWorld('octanis', octanisApi)
