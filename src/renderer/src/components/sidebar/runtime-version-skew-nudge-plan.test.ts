import { describe, expect, it } from 'vitest'
import type { AppVersionSkew } from '../../../../shared/app-version-skew'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import {
  planRuntimeVersionSkewNudges,
  runtimeVersionSkewNudgeKey
} from './runtime-version-skew-nudge-plan'

const SKEW: AppVersionSkew = {
  direction: 'server-older',
  clientAppVersion: '1.4.147',
  serverAppVersion: '1.4.146'
}

function reachableStatus(): RuntimeStatus {
  return {
    runtimeId: 'runtime-1',
    rendererGraphEpoch: 1,
    graphStatus: 'ready',
    authoritativeWindowId: 1,
    liveTabCount: 0,
    liveLeafCount: 0
  }
}

describe('planRuntimeVersionSkewNudges', () => {
  it('shows a nudge for a newly skewed environment', () => {
    const actions = planRuntimeVersionSkewNudges({
      statuses: new Map([['env-1', { status: reachableStatus(), versionSkew: SKEW }]]),
      shownKeyByEnvironmentId: new Map()
    })
    expect(actions).toEqual([
      { kind: 'show', environmentId: 'env-1', key: runtimeVersionSkewNudgeKey(SKEW), skew: SKEW }
    ])
  })

  it('does not re-show the same version pair within a session', () => {
    const actions = planRuntimeVersionSkewNudges({
      statuses: new Map([['env-1', { status: reachableStatus(), versionSkew: SKEW }]]),
      shownKeyByEnvironmentId: new Map([['env-1', runtimeVersionSkewNudgeKey(SKEW)]])
    })
    expect(actions).toEqual([])
  })

  it('re-shows when the version pair changes', () => {
    const nextSkew: AppVersionSkew = { ...SKEW, clientAppVersion: '1.4.148' }
    const actions = planRuntimeVersionSkewNudges({
      statuses: new Map([['env-1', { status: reachableStatus(), versionSkew: nextSkew }]]),
      shownKeyByEnvironmentId: new Map([['env-1', runtimeVersionSkewNudgeKey(SKEW)]])
    })
    expect(actions).toEqual([
      {
        kind: 'show',
        environmentId: 'env-1',
        key: runtimeVersionSkewNudgeKey(nextSkew),
        skew: nextSkew
      }
    ])
  })

  it('clears only when a reachable probe reports matching versions', () => {
    const shown = new Map([['env-1', runtimeVersionSkewNudgeKey(SKEW)]])
    expect(
      planRuntimeVersionSkewNudges({
        statuses: new Map([['env-1', { status: reachableStatus(), versionSkew: null }]]),
        shownKeyByEnvironmentId: shown
      })
    ).toEqual([{ kind: 'clear', environmentId: 'env-1' }])
    // Why: an unreachable blip must not reset the dedupe — that would re-toast
    // the same skew after every reconnect.
    expect(
      planRuntimeVersionSkewNudges({
        statuses: new Map([['env-1', { status: null }]]),
        shownKeyByEnvironmentId: shown
      })
    ).toEqual([])
  })

  it('handles multiple environments independently', () => {
    const otherSkew: AppVersionSkew = { ...SKEW, direction: 'server-newer', serverAppVersion: null }
    const actions = planRuntimeVersionSkewNudges({
      statuses: new Map([
        ['env-shown', { status: reachableStatus(), versionSkew: SKEW }],
        ['env-new', { status: reachableStatus(), versionSkew: otherSkew }]
      ]),
      shownKeyByEnvironmentId: new Map([['env-shown', runtimeVersionSkewNudgeKey(SKEW)]])
    })
    expect(actions).toEqual([
      {
        kind: 'show',
        environmentId: 'env-new',
        key: runtimeVersionSkewNudgeKey(otherSkew),
        skew: otherSkew
      }
    ])
  })
})
