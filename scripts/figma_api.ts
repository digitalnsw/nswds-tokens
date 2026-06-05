import axios from 'axios'
import {
  GetLocalVariablesResponse,
  PostVariablesRequestBody,
  PostVariablesResponse,
} from '@figma/rest-api-spec'

// Convert a request failure into a sanitised Error. This prevents the raw AxiosError —
// which carries the request config including the `X-Figma-Token` header — from being
// thrown/printed and leaking the credential into logs (incl. CI output).
function toSafeFigmaError(err: unknown, context: string): Error {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const message = (err.response?.data as { message?: string } | undefined)?.message ?? err.message
    return new Error(`Figma API ${context} failed${status ? ` (HTTP ${status})` : ''}: ${message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

export default class FigmaApi {
  private baseUrl = 'https://api.figma.com'
  private token: string

  constructor(token: string) {
    this.token = token
  }

  async getLocalVariables(fileKey: string) {
    try {
      const resp = await axios.request<GetLocalVariablesResponse>({
        url: `${this.baseUrl}/v1/files/${fileKey}/variables/local`,
        headers: {
          Accept: '*/*',
          'X-Figma-Token': this.token,
        },
      })

      return resp.data
    } catch (err) {
      throw toSafeFigmaError(err, 'getLocalVariables')
    }
  }

  async postVariables(fileKey: string, payload: PostVariablesRequestBody) {
    try {
      const resp = await axios.request<PostVariablesResponse>({
        url: `${this.baseUrl}/v1/files/${fileKey}/variables`,
        method: 'POST',
        headers: {
          Accept: '*/*',
          'X-Figma-Token': this.token,
        },
        data: payload,
      })

      return resp.data
    } catch (err) {
      throw toSafeFigmaError(err, 'postVariables')
    }
  }
}
