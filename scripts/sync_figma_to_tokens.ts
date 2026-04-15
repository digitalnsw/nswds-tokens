import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'

import FigmaApi from './figma_api.js'

import { assertSafePathSegment, green } from './utils.js'
import { tokenFilesFromLocalVariables } from './token_export.js'

/**
 * Usage:
 *
 * // Defaults to writing to the tokens_new directory
 * npm run sync-figma-to-tokens
 *
 * // Writes to the specified directory name inside the current working directory
 * npm run sync-figma-to-tokens -- --output directory_name
 */

async function main() {
  if (!process.env.PERSONAL_ACCESS_TOKEN || !process.env.FILE_KEY) {
    throw new Error('PERSONAL_ACCESS_TOKEN and FILE_KEY environment variables are required')
  }
  const fileKey = process.env.FILE_KEY

  const api = new FigmaApi(process.env.PERSONAL_ACCESS_TOKEN)
  const localVariables = await api.getLocalVariables(fileKey)

  const tokensFiles = tokenFilesFromLocalVariables(localVariables)

  let outputDirName = 'tokens_new'
  const outputArgIdx = process.argv.indexOf('--output')
  if (outputArgIdx !== -1) {
    outputDirName = assertSafePathSegment(process.argv[outputArgIdx + 1], 'output directory name')
  }
  const outputDirPath = path.join(process.cwd(), outputDirName)
  const outputDirLabel = path.relative(process.cwd(), outputDirPath) || '.'

  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true })
  }

  const currentWorkingDirectory = process.cwd()

  process.chdir(outputDirPath)

  try {
    Object.entries(tokensFiles).forEach(([fileName, fileContent]) => {
      const safeFileName = assertSafePathSegment(fileName, 'token file name')
      fs.writeFileSync(safeFileName, JSON.stringify(fileContent, null, 2))
      console.log(
        `Wrote ${path.relative(currentWorkingDirectory, path.join(outputDirPath, safeFileName))}`,
      )
    })
  } finally {
    process.chdir(currentWorkingDirectory)
  }

  console.log(green(`✅ Tokens files have been written to the ${outputDirLabel} directory`))
}

main()
