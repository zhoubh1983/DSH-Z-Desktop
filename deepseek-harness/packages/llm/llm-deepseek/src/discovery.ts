/**
 * DeepSeek endpoint interrogation for the configuration surface's model
 * listing and credential-check actions.
 *
 * The official DeepSeek API and its OpenAI-compatible gateways expose the same
 * `GET /models` listing shape the shared discovery helper reads, so the probe
 * delegates to it. Unlike pi-ai, there is deliberately **no** catalog
 * short-circuit here: this module exists so a save can genuinely validate a
 * drafted endpoint + key over the wire, which a static catalog would answer
 * without ever testing the credential.
 *
 * @module dsh-llm-deepseek/discovery
 */

import { listOpenAiCompatibleModels, usableProbeKey } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm'

/**
 * Probe a deepseek endpoint for the models it advertises, validating the
 * endpoint and key in the same transit the user is about to save.
 * @param request - the drafted endpoint and one-shot credential from the form.
 * @param resolveBaseURL - the profile's effective endpoint, used when the draft
 *   carries none (an already-configured route revalidates its stored URL).
 * @param storedApiKey - the credential the configured route already resolves,
 *   asked for only when the draft carries none. `undefined` — not a throw — is
 *   how "no key stored" is reported, so the probe stays unauthenticated.
 * @returns the advertised models in endpoint order.
 * @throws LlmError from the shared helper: `INVALID_CREDENTIAL_CODE` on a
 *   401/403, `DISCOVERY_FAILED` on transport or shape failures.
 */
export async function probeDeepSeek(
  request: LlmModelDiscoveryRequest,
  resolveBaseURL: () => string,
  storedApiKey?: () => Promise<string | undefined>,
): Promise<readonly LlmDiscoveredModel[]> {
  const baseURL = (request.baseURL !== undefined && request.baseURL.length > 0)
    ? request.baseURL
    : resolveBaseURL()
  const supplied = request.apiKey ?? await storedApiKey?.()
  const apiKey = supplied === undefined ? undefined : usableProbeKey(supplied)
  return listOpenAiCompatibleModels({
    baseURL,
    ...apiKey === undefined ? {} : { apiKey },
    ...request.signal === undefined ? {} : { signal: request.signal },
  })
}