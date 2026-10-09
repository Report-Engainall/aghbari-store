import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export type QuantityInputTone = 'sky' | 'mint' | 'slate'

export interface CommercePolicies {
  customer_prices_hidden: boolean
  require_quantity_approval: boolean
  payment_request_after_approval: boolean
  quantity_input_tone: QuantityInputTone
}

export const DEFAULT_COMMERCE_POLICIES: CommercePolicies = {
  customer_prices_hidden: true,
  require_quantity_approval: true,
  payment_request_after_approval: true,
  quantity_input_tone: 'sky',
}

export function useCommercePolicies() {
  const { organization } = useAuth()
  const [policies, setPolicies] = useState<CommercePolicies>(DEFAULT_COMMERCE_POLICIES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!organization?.id) {
      setPolicies(DEFAULT_COMMERCE_POLICIES)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('commerce_policy_settings')
      .select('customer_prices_hidden, require_quantity_approval, payment_request_after_approval, quantity_input_tone')
      .eq('organization_id', organization.id)
      .maybeSingle()

    if (queryError) {
      // Fail closed: customer prices remain hidden and quantity approval remains required.
      setPolicies(DEFAULT_COMMERCE_POLICIES)
      setError(queryError.message)
    } else {
      setPolicies({
        ...DEFAULT_COMMERCE_POLICIES,
        ...(data ?? {}),
      } as CommercePolicies)
      setError(null)
    }
    setLoading(false)
  }, [organization?.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(async (next: CommercePolicies) => {
    if (!organization?.id) {
      setError('تعذر تحديد المؤسسة الحالية.')
      return false
    }

    setSaving(true)
    setError(null)
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      setError('انتهت الجلسة. سجّل الدخول ثم أعد المحاولة.')
      setSaving(false)
      return false
    }

    const { error: saveError } = await supabase
      .from('commerce_policy_settings')
      .upsert({
        organization_id: organization.id,
        customer_prices_hidden: next.customer_prices_hidden,
        require_quantity_approval: next.require_quantity_approval,
        payment_request_after_approval: next.payment_request_after_approval,
        quantity_input_tone: next.quantity_input_tone,
        updated_by: authData.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' })

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return false
    }
    setPolicies(next)
    return true
  }, [organization?.id])

  return { policies, setPolicies, loading, saving, error, refresh, save }
}
