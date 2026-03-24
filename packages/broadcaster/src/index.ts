#!/usr/bin/env node
import { program } from 'commander'
import { playCommand } from './cli.js'

program
  .name('octanis-broadcaster')
  .description('Octanis audio broadcaster — plays or streams .octanis.json projects')
  .version('0.1.0')

program
  .command('play <projectFile>')
  .description('Play a project through local audio output')
  .action(async (projectFile: string) => {
    await playCommand(projectFile)
  })

program.parseAsync(process.argv)
