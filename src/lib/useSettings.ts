import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Setting } from './types'

const cache: Record<string, string> = {}

async function readSettings(): Promise<Setting[] | null> {
  const { data }: { data: Setting[] | null } = await supabase.from('settings').select('*')
  return data
}

function createSettingsMap(rows: Setting[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const row of rows) {
    next[row.key] = row.value
  }
  return next
}

export function useSettings() {
  const [settings, setSettings] = useState<Record<string, string>>(cache)
  const [loading, setLoading] = useState(Object.keys(cache).length === 0)

  useEffect(() => {
    if (Object.keys(cache).length > 0) {
      setSettings(cache)
      setLoading(false)
      return
    }

    let active = true
    const loadSettings = async () => {
      try {
        const rows = await readSettings()
        if (!active || !rows) return
        const next = createSettingsMap(rows)
        Object.assign(cache, next)
        setSettings(next)
      } catch {
        if (active) setSettings(cache)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadSettings()
    return () => {
      active = false
    }
  }, [])

  return { settings, loading }
}
