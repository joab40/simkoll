import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from './api-request.js'
import { createCommunityChannelResource } from './community-channel-resource.js'
import { startVisiblePolling } from './visible-refresh.js'

export function useCommunityChannel({ code, channel, active = true, request = apiRequest, merge }) {
  const [snapshot, setSnapshot] = useState(null)
  const resource = useMemo(() => {
    const instance = createCommunityChannelResource({ request, code, url: `/api/community?${channel}`, merge, onChange: state => setSnapshot({ resource: instance, ...state }) })
    return instance
  }, [code, channel, request, merge])
  useEffect(() => { resource.activate(); return () => resource.dispose() }, [resource])
  useEffect(() => active ? startVisiblePolling(() => resource.refresh({ maxAge: 10000 }), 30000, { events: channel === 'channel=private' ? ['focus', 'simkoll-private-message-sent'] : ['focus'] }) : undefined, [active, channel, resource])
  const refresh = useCallback(options => resource.refresh(options), [resource])
  const setData = useCallback(updater => resource.update(updater), [resource])
  return { ...(snapshot?.resource === resource ? snapshot : { data: null, loading: true, refreshing: false, error: '' }), refresh, setData }
}
