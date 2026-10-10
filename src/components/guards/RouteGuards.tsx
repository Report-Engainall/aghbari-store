import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { FullPageLoader } from '@/components/ui/Loader'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, organization, isPlatformAdmin } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader message="جاري التحقق من الجلسة..." />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (isPlatformAdmin) return <Navigate to="/platform/organizations" replace />
  if (!organization && location.pathname !== '/onboarding/company' && location.pathname !== '/account/pending') {
    return <Navigate to="/onboarding/company" replace />
  }
  if (organization && (organization.status !== 'active' || !organization.is_active)
    && location.pathname !== '/account/pending' && location.pathname !== '/onboarding/company') {
    return <Navigate to="/account/pending" replace />
  }
  return <>{children}</>
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, organization, isAdmin, isPlatformAdmin } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader message="جاري التحقق من الصلاحيات..." />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (isPlatformAdmin) return <Navigate to="/platform/organizations" replace />
  if (!organization) return <Navigate to="/onboarding/company" replace />
  if (organization.status !== 'active' || !organization.is_active) return <Navigate to="/account/pending" replace />
  if (!isAdmin) return <Navigate to="/store" replace />
  return <>{children}</>
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading, organization, isPlatformAdmin } = useAuth()
  if (loading) return <FullPageLoader />
  if (user) {
    if (isPlatformAdmin) return <Navigate to="/platform/organizations" replace />
    if (!organization) return <Navigate to="/onboarding/company" replace />
    if (organization.status !== 'active' || !organization.is_active) return <Navigate to="/account/pending" replace />
    return <Navigate to="/store" replace />
  }
  return <>{children}</>
}

export function PlatformAdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, isPlatformAdmin } = useAuth()

  if (loading) return <FullPageLoader message="جاري التحقق من صلاحية مسؤول المنصة..." />
  if (!user) return <Navigate to="/login" replace />
  if (!isPlatformAdmin) return <Navigate to="/store" replace />
  return <>{children}</>
}
