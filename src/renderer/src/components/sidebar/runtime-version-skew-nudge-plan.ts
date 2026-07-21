import type { AppVersionSkew } from '../../../../shared/app-version-skew'
import type { RuntimeStatus } from '../../../../shared/runtime-types'

// Why: the sidebar host-header warning only renders in explicit host-filter
// views, so skew also needs a proactive toast. This planner owns the show/
// clear decisions as pure data so the nudge cadence is unit-testable.
export type RuntimeVersionSkewNudgeAction =
  | { kind: 'show'; environmentId: string; key: string; skew: AppVersionSkew }
  | { kind: 'clear'; environmentId: string }

export function runtimeVersionSkewNudgeKey(skew: AppVersionSkew): string {
  return [skew.direction, skew.clientAppVersion, skew.serverAppVersion ?? ''].join('\0')
}

export function planRuntimeVersionSkewNudges(args: {
  statuses: ReadonlyMap<
    string,
    { status: RuntimeStatus | null; versionSkew?: AppVersionSkew | null }
  >
  /** Skew key already toasted this session, per environment. */
  shownKeyByEnvironmentId: ReadonlyMap<string, string>
}): RuntimeVersionSkewNudgeAction[] {
  const actions: RuntimeVersionSkewNudgeAction[] = []
  for (const [environmentId, entry] of args.statuses) {
    const skew = entry.versionSkew
    if (!skew) {
      // Why: only a reachable, version-matched probe proves the skew resolved.
      // An unreachable blip (status null) must not reset the session dedupe,
      // or the same toast would re-fire on every reconnect.
      if (entry.status && args.shownKeyByEnvironmentId.has(environmentId)) {
        actions.push({ kind: 'clear', environmentId })
      }
      continue
    }
    const key = runtimeVersionSkewNudgeKey(skew)
    // Why: one toast per version pair per session — periodic probes and manual
    // status refreshes re-record the same skew and must not re-nag. A new
    // version pair (e.g. the next update race) notifies again.
    if (args.shownKeyByEnvironmentId.get(environmentId) === key) {
      continue
    }
    actions.push({ kind: 'show', environmentId, key, skew })
  }
  return actions
}
