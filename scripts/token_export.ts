import { GetLocalVariablesResponse, LocalVariable } from '@figma/rest-api-spec'
import { rgbToDtcg } from './color.js'
import {
  exportRuleFor,
  fileNameForCollection,
  FIGMA_REM_PX,
  FigmaValueRule,
} from './figma-collections.js'
import { Token, TokenGroup, TokenOrTokenGroup, TokensFile } from './token_types.js'
import { assertSafeObjectKey, assertSafePathSegment } from './utils.js'

type TokenTreeNode = {
  children: Map<string, TokenTreeNode>
  token?: Token
}

function createTokenTreeNode(): TokenTreeNode {
  return {
    children: new Map(),
  }
}

function tokenTypeFromVariable(variable: LocalVariable, rule: FigmaValueRule | null) {
  if (rule) return rule.$type
  switch (variable.resolvedType) {
    case 'BOOLEAN':
      return 'boolean'
    case 'COLOR':
      return 'color'
    case 'FLOAT':
      return 'number'
    case 'STRING':
      return 'string'
  }
}

function tokenValueFromVariable(
  variable: LocalVariable,
  modeId: string,
  localVariables: Map<string, LocalVariable>,
  rule: FigmaValueRule | null,
) {
  const value = variable.valuesByMode[modeId]
  if (typeof value === 'object') {
    if ('type' in value && value.type === 'VARIABLE_ALIAS') {
      const aliasedVariable = localVariables.get(value.id)
      if (!aliasedVariable) {
        throw new Error(`Aliased variable not found: ${value.id}`)
      }
      return `{${aliasedVariable.name.replace(/\//g, '.')}}`
    } else if ('r' in value) {
      return rgbToDtcg(value)
    }

    throw new Error(`Format of variable value is invalid: ${value}`)
  }
  // Manifest-driven reconstruction back to the DTCG shapes the staging files use.
  if (rule?.$type === 'dimension' && typeof value === 'number') {
    return rule.unit === 'rem'
      ? { value: value / FIGMA_REM_PX, unit: 'rem' as const }
      : { value, unit: 'px' as const }
  }
  if (rule?.$type === 'fontFamily' && typeof value === 'string') {
    return value.includes(', ') ? value.split(', ') : value
  }
  return value
}

export function tokenFilesFromLocalVariables(localVariablesResponse: GetLocalVariablesResponse) {
  const tokenFileTrees = new Map<string, TokenTreeNode>()
  const localVariableCollections = new Map(
    Object.values(localVariablesResponse.meta.variableCollections).map((collection) => [
      collection.id,
      collection,
    ]),
  )
  const localVariables = new Map(
    Object.values(localVariablesResponse.meta.variables).map((variable) => [variable.id, variable]),
  )

  localVariables.forEach((variable) => {
    // Skip remote variables because we only want to generate tokens for local variables
    if (variable.remote) {
      return
    }

    const collection = localVariableCollections.get(variable.variableCollectionId)
    if (!collection) {
      throw new Error(`Variable collection not found for variable "${variable.name}"`)
    }

    collection.modes.forEach((mode) => {
      // Manifest-mapped collections regenerate their kebab-case staging file names;
      // unmapped collections keep the legacy `${collection}.${mode}.json` convention.
      const fileName =
        fileNameForCollection(collection.name, mode.name) ??
        `${assertSafePathSegment(collection.name, 'collection name')}.${assertSafePathSegment(mode.name, 'mode name')}.json`

      if (!tokenFileTrees.has(fileName)) {
        tokenFileTrees.set(fileName, createTokenTreeNode())
      }

      let node = tokenFileTrees.get(fileName)!
      const pathSegments = variable.name
        .split('/')
        .map((segment) => assertSafeObjectKey(segment, `token path segment in "${variable.name}"`))

      pathSegments.forEach((groupName, index) => {
        const segmentPath = pathSegments.slice(0, index + 1).join('/')
        const next = node.children.get(groupName)

        if (!next) {
          const childNode = createTokenTreeNode()
          node.children.set(groupName, childNode)
          node = childNode
          return
        }

        if (next.token && index < pathSegments.length - 1) {
          throw new Error(
            `Token name collision in ${fileName}: "${segmentPath}" is already defined as a token`,
          )
        }

        node = next
      })

      if (node.token) {
        throw new Error(
          `Token name collision in ${fileName}: "${variable.name}" is already defined as a token`,
        )
      }

      if (node.children.size > 0) {
        throw new Error(
          `Token name collision in ${fileName}: "${variable.name}" conflicts with an existing token group`,
        )
      }

      const rule = exportRuleFor(collection.name, pathSegments[0])
      const token: Token = {
        $type: tokenTypeFromVariable(variable, rule),
        $value: tokenValueFromVariable(variable, mode.modeId, localVariables, rule),
        $description: variable.description,
        $extensions: {
          'com.figma': {
            hiddenFromPublishing: variable.hiddenFromPublishing,
            scopes: variable.scopes,
            codeSyntax: variable.codeSyntax,
          },
        },
      }

      node.token = token
    })
  })

  return Object.fromEntries(
    [...tokenFileTrees.entries()].map(([fileName, tokenTree]) => [
      fileName,
      tokenTreeNodeToTokensFile(tokenTree),
    ]),
  )
}

function tokenTreeNodeToTokensFile(tokenTree: TokenTreeNode) {
  const tokensFile: TokensFile = {}

  tokenTree.children.forEach((childNode, childName) => {
    tokensFile[childName] = tokenTreeNodeToTokenValue(childNode)
  })

  return tokensFile
}

function tokenTreeNodeToTokenValue(tokenTree: TokenTreeNode): TokenOrTokenGroup {
  if (tokenTree.token) {
    return tokenTree.token
  }

  const tokenGroup: TokenGroup = {}

  tokenTree.children.forEach((childNode, childName) => {
    tokenGroup[childName] = tokenTreeNodeToTokenValue(childNode)
  })

  return tokenGroup
}
