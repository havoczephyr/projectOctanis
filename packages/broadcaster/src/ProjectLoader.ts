import { readFile } from 'fs/promises'
import { OctanisProjectFileSchema, type OctanisProjectFile } from '@octanis/shared'

export const ProjectLoader = {
  async load(filePath: string): Promise<OctanisProjectFile> {
    let raw: string
    try {
      raw = await readFile(filePath, 'utf-8')
    } catch {
      throw new Error(`Cannot read project file: ${filePath}`)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`Project file is not valid JSON: ${filePath}`)
    }

    const result = OctanisProjectFileSchema.safeParse(parsed)
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
        .join('\n')
      throw new Error(`Project file validation failed:\n${issues}`)
    }

    return result.data
  },
}
