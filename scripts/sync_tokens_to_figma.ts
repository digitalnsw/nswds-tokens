import 'dotenv/config'
import * as fs from 'fs'

import FigmaApi from './figma_api.js'

import { green } from './utils.js'
import { generatePostVariablesPayload, readJsonFiles } from './token_import.js'

async function main() {
  if (!process.env.PERSONAL_ACCESS_TOKEN || !process.env.FILE_KEY) {
    throw new Error('PERSONAL_ACCESS_TOKEN and FILE_KEY environemnt variables are required')
  }
  const fileKey = process.env.FILE_KEY

  const TOKENS_DIR = 'tokens'
  const tokensFiles = fs
    .readdirSync(TOKENS_DIR)
    .filter((file: string) => {
      const fullPath = `${TOKENS_DIR}/${file}`
      // Only sync staging .json files — tokens/ also holds README.md and the
      // category/layer source directories, which are not Figma collections.
      return file.endsWith('.json') && fs.statSync(fullPath).isFile()
    })
    .map((file: string) => `${TOKENS_DIR}/${file}`)

  const tokensByFile = readJsonFiles(tokensFiles)

  console.log('Read tokens files:', Object.keys(tokensByFile))

  const api = new FigmaApi(process.env.PERSONAL_ACCESS_TOKEN)
  const localVariables = await api.getLocalVariables(fileKey)

  const postVariablesPayload = generatePostVariablesPayload(tokensByFile, localVariables)

  if (Object.values(postVariablesPayload).every((value) => value.length === 0)) {
    console.log(green('✅ Tokens are already up to date with the Figma file'))
    return
  }

  // --dry-run: report what WOULD be posted, grouped by action, then exit without writing.
  if (process.argv.includes('--dry-run')) {
    const summarise = (items: { action: string }[] | undefined, label: string) => {
      if (!items || items.length === 0) return
      const byAction = new Map<string, number>()
      for (const item of items) byAction.set(item.action, (byAction.get(item.action) ?? 0) + 1)
      const parts = [...byAction.entries()].map(([action, n]) => `${n} ${action}`)
      console.log(`  ${label}: ${parts.join(', ')}`)
    }
    console.log('Dry run — the POST payload would contain:')
    summarise(postVariablesPayload.variableCollections, 'variableCollections')
    summarise(postVariablesPayload.variableModes, 'variableModes')
    summarise(postVariablesPayload.variables, 'variables')
    if (postVariablesPayload.variableModeValues?.length) {
      console.log(`  variableModeValues: ${postVariablesPayload.variableModeValues.length} values`)
    }
    if (postVariablesPayload.variableCollections?.length) {
      console.log(
        `  collections touched: ${postVariablesPayload.variableCollections
          .map((c) => ('name' in c && c.name) || c.id)
          .join(', ')}`,
      )
    }
    console.log(green('✅ Dry run complete — nothing was posted to Figma'))
    return
  }

  const apiResp = await api.postVariables(fileKey, postVariablesPayload)

  console.log('POST variables API response:', apiResp)

  if (postVariablesPayload.variableCollections && postVariablesPayload.variableCollections.length) {
    console.log('Updated variable collections', postVariablesPayload.variableCollections)
  }

  if (postVariablesPayload.variableModes && postVariablesPayload.variableModes.length) {
    console.log('Updated variable modes', postVariablesPayload.variableModes)
  }

  if (postVariablesPayload.variables && postVariablesPayload.variables.length) {
    console.log('Updated variables', postVariablesPayload.variables)
  }

  if (postVariablesPayload.variableModeValues && postVariablesPayload.variableModeValues.length) {
    console.log('Updated variable mode values', postVariablesPayload.variableModeValues)
  }

  console.log(green('✅ Figma file has been updated with the new tokens'))
}

main().catch((err: unknown) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
