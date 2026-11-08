import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  fetchMyPersonalizationSettings,
  saveMyPersonalizationPreferences,
  revokeMyPersonalizationChannelConsent,
  type PersonalizationSettingsSnapshot,
} from "@/lib/intelligence/personalization-preferences-client";
import {
  PersonalizationPrivacyPanel,
  type PersonalizationPreferencesSaveRequest,
  type PersonalizationPreferencesSaveResult,
} from "@/components/intelligence/PersonalizationPrivacyPanel";

const CHANNEL_CAPABILITIES = {
  IN_APP: true,
  EMAIL: false,
  WHATSAPP: false,
  SMS: false,
} as const;

export function AccountPersonalizationSettings() {
  const { user, sessionRevision } = useAuth();
  const profileId = user?.profileId ?? null;
  const [snapshot, setSnapshot] = useState<PersonalizationSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) {
      setSnapshot(null);
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setSnapshot(null);
    setLoadError(null);
    const result = await fetchMyPersonalizationSettings(profileId);
    if (result.ok) {
      setSnapshot(result.snapshot);
    } else {
      setLoadError(result.message);
    }
    setLoading(false);
  }, [profileId, sessionRevision]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const root = document.documentElement;
    if (snapshot?.preferences.reducedMotion) {
      root.setAttribute("data-aghbari-reduced-motion", "true");
    } else {
      root.removeAttribute("data-aghbari-reduced-motion");
    }
    return () => root.removeAttribute("data-aghbari-reduced-motion");
  }, [snapshot?.preferences.reducedMotion]);

  const save = useCallback(async (
    request: PersonalizationPreferencesSaveRequest,
  ): Promise<PersonalizationPreferencesSaveResult> => {
    if (!profileId) return { ok: false, message: "انتهت جلسة الحساب؛ أعد تسجيل الدخول." };
    const result = await saveMyPersonalizationPreferences(profileId, request);
    if (!result.ok) return result;
    setSnapshot(current => current
      ? { ...current, preferences: result.preferences }
      : current);
    return result;
  }, [profileId]);

  const revokeConsent = useCallback(async (
    request: { consentId: string; expectedGrantedAt: string },
  ) => {
    if (!profileId) return { ok: false as const, message: "انتهت جلسة الحساب؛ أعد تسجيل الدخول." };
    const result = await revokeMyPersonalizationChannelConsent(profileId, request);
    if (!result.ok) return result;
    setSnapshot(current => current ? {
      ...current,
      externalConsents: current.externalConsents.map(consent =>
        consent.id === result.consent.id ? result.consent : consent,
      ),
    } : current);
    return result;
  }, [profileId]);

  return (
    <>
      <style>{`
        html[data-aghbari-reduced-motion="true"] *,
        html[data-aghbari-reduced-motion="true"] *::before,
        html[data-aghbari-reduced-motion="true"] *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
        }
      `}</style>
      <PersonalizationPrivacyPanel
        authorized={Boolean(user)}
        preferences={snapshot?.preferences ?? null}
        loading={loading}
        loadError={loadError}
        channelCapabilities={CHANNEL_CAPABILITIES}
        externalConsents={snapshot?.externalConsents ?? []}
        consentReadStatus={snapshot?.consentReadStatus ?? "UNAVAILABLE"}
        onSavePreferences={save}
        onRevokeConsent={revokeConsent}
        onRetry={() => void load()}
      />
    </>
  );
}
