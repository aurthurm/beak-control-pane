import type { WorkspaceDashboard } from '~/types/workspace-dashboard'

export function useWorkspaceDashboard<T extends WorkspaceDashboard = WorkspaceDashboard>() {
  return useFetch<T>('/api/dashboard', { key: 'bcp-workspace-dashboard' })
}
