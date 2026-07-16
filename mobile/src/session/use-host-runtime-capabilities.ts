import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { MOBILE_AI_VAULT_CAPABILITY } from '../agent-history/agent-history-capability'
import {
  CLIPBOARD_FILE_UPLOAD_RUNTIME_CAPABILITY,
  TERMINAL_QUERY_REPLY_INPUT_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import { supportsMobileQuickCommands } from '../terminal/quick-commands'
import { startRuntimeCapabilityProbe } from '../transport/runtime-capability-probe'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'

type HostRuntimeCapabilities = {
  readonly browserScreencastSupported: boolean | null
  // Why: hosts without aiVault.v1 reject aiVault.listSessions, so the header
  // entry stays hidden there (mirrors the gated host-list action) instead of
  // opening a dead-end "update this host" panel.
  readonly agentSessionHistorySupported: boolean | null
  // Why: old hosts strip fileName from the clipboard upload methods and would
  // save a PDF as `….png`, so the unfiltered picker unlocks only when the host
  // advertises clipboard.file-upload.v1. False until the probe resolves.
  readonly fileAttachmentsSupported: boolean
  // Why: older hosts lack the targeted settings RPCs and strip agentPrompt from
  // terminal creation, so Quick Commands stays hidden unless advertised.
  readonly quickCommandsSupported: boolean | null
  // Why: read via a ref because stable terminal callbacks are created before
  // the capability probe resolves. Hosts without this capability strip
  // inputKind from terminal.send, so a forwarded xterm reply would become
  // floor-stealing shell input.
  readonly hostQueryReplyInputSupportedRef: MutableRefObject<boolean>
}

// Probes status.get per connection and exposes which gated host features this
// session may use. Everything resets to "unsupported" on disconnect.
export function useHostRuntimeCapabilities(
  client: RpcClient | null,
  connState: ConnectionState
): HostRuntimeCapabilities {
  const [browserScreencastSupported, setBrowserScreencastSupported] = useState<boolean | null>(null)
  const [agentSessionHistorySupported, setAgentSessionHistorySupported] = useState<boolean | null>(
    null
  )
  const [fileAttachmentsSupported, setFileAttachmentsSupported] = useState(false)
  const [quickCommandsSupported, setQuickCommandsSupported] = useState<boolean | null>(null)
  const hostQueryReplyInputSupportedRef = useRef(false)

  useEffect(() => {
    // Why: a client swap can keep the route connected while moving to an older
    // host; clear the prior capability before exposing host-specific actions.
    setBrowserScreencastSupported(null)
    setAgentSessionHistorySupported(null)
    setFileAttachmentsSupported(false)
    setQuickCommandsSupported(null)
    hostQueryReplyInputSupportedRef.current = false
    if (!client || connState !== 'connected') {
      return
    }
    // Why: the probe retries — a relay→direct cutover or request timeout rejects
    // status.get without changing connState, which used to latch these hidden.
    return startRuntimeCapabilityProbe(client, (capabilities) => {
      setBrowserScreencastSupported(capabilities.includes('browser.screencast.v1'))
      setAgentSessionHistorySupported(capabilities.includes(MOBILE_AI_VAULT_CAPABILITY))
      setFileAttachmentsSupported(capabilities.includes(CLIPBOARD_FILE_UPLOAD_RUNTIME_CAPABILITY))
      setQuickCommandsSupported(supportsMobileQuickCommands(capabilities))
      hostQueryReplyInputSupportedRef.current = capabilities.includes(
        TERMINAL_QUERY_REPLY_INPUT_RUNTIME_CAPABILITY
      )
    })
  }, [client, connState])

  return {
    browserScreencastSupported,
    agentSessionHistorySupported,
    fileAttachmentsSupported,
    quickCommandsSupported,
    hostQueryReplyInputSupportedRef
  }
}
