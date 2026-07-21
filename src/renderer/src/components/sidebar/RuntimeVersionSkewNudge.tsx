import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { describeAppVersionSkew } from '../../../../shared/app-version-skew'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { planRuntimeVersionSkewNudges } from './runtime-version-skew-nudge-plan'

// Why: proactive counterpart to the sidebar host-header skew warning — that
// warning only renders in explicit host-filter views, so a user in the default
// Projects view would first meet version skew as a confusing feature failure.
export function RuntimeVersionSkewNudge(): null {
  const statuses = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const environments = useAppStore((s) => s.runtimeEnvironments)
  const shownKeys = useRef(new Map<string, string>())
  const activeToasts = useRef(new Map<string, string | number>())

  // Why: infinite-duration toasts outlive this component; without unmount cleanup they linger as undismissable ghosts (and duplicate under StrictMode remounts).
  useEffect(() => {
    const toasts = activeToasts.current
    const keys = shownKeys.current
    return () => {
      for (const id of toasts.values()) {
        toast.dismiss(id)
      }
      toasts.clear()
      keys.clear()
    }
  }, [])

  useEffect(() => {
    const retractToast = (environmentId: string): void => {
      const activeId = activeToasts.current.get(environmentId)
      if (activeId !== undefined) {
        activeToasts.current.delete(environmentId)
        toast.dismiss(activeId)
      }
    }
    for (const action of planRuntimeVersionSkewNudges({
      statuses,
      shownKeyByEnvironmentId: shownKeys.current
    })) {
      if (action.kind === 'clear') {
        shownKeys.current.delete(action.environmentId)
        retractToast(action.environmentId)
        continue
      }
      const { environmentId, skew } = action
      shownKeys.current.set(environmentId, action.key)
      retractToast(environmentId)
      // Why: the name can lag the first probe (pairing races status refresh) or
      // be unset; a generic title beats surfacing an opaque environment id.
      const name = environments
        .find((environment) => environment.id === environmentId)
        ?.name?.trim()
      const id = toast.warning(
        skew.direction === 'server-older'
          ? name
            ? translate(
                'auto.components.sidebar.RuntimeVersionSkewNudge.titleServerOlder',
                'Orca server "{{value0}}" is outdated',
                { value0: name }
              )
            : translate(
                'auto.components.sidebar.RuntimeVersionSkewNudge.titleServerOlderUnnamed',
                'An Orca server is outdated'
              )
          : name
            ? translate(
                'auto.components.sidebar.RuntimeVersionSkewNudge.titleServerNewer',
                'Orca server "{{value0}}" is newer than this app',
                { value0: name }
              )
            : translate(
                'auto.components.sidebar.RuntimeVersionSkewNudge.titleServerNewerUnnamed',
                'An Orca server is newer than this app'
              ),
        {
          description: describeAppVersionSkew(skew),
          // Why: skew persists until someone updates a machine; an auto-expiring
          // toast would be missed exactly by the users who need it.
          duration: Number.POSITIVE_INFINITY,
          onDismiss: () => {
            if (activeToasts.current.get(environmentId) === id) {
              activeToasts.current.delete(environmentId)
            }
          },
          action: {
            label: translate(
              'auto.components.sidebar.RuntimeVersionSkewNudge.manageServer',
              'Manage server'
            ),
            onClick: () => {
              if (activeToasts.current.get(environmentId) === id) {
                activeToasts.current.delete(environmentId)
              }
              const state = useAppStore.getState()
              state.openSettingsTarget({
                pane: 'servers',
                repoId: null,
                sectionId: environmentId
              })
              state.openSettingsPage()
            }
          }
        }
      )
      activeToasts.current.set(environmentId, id)
    }
  }, [environments, statuses])

  return null
}
