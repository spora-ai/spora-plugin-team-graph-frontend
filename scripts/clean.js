#!/usr/bin/env node
/**
 * Removes the build artifacts so a clean `npm run build` can run.
 */
import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const targets = ['frontend/main.js', 'frontend/style.css']
for (const t of targets) {
    if (existsSync(t)) {
        await rm(t)
        console.log(`Removed ${t}`)
    }
}