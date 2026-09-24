import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../shared/lib/supabase';
import { slugFromHost } from '../org/subdomain';
import type { MembershipWithOrg } from '../../types/database';
import { AuthContext, type AuthState } from './AuthContext';

const ACTIVE_ORG_KEY = 'scalar.active_org';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_ORG_KEY),
  );

  // Usuario de la última sesión vista; `undefined` hasta la primera.
  const usuarioVisto = useRef<string | null | undefined>(undefined);

  // Sesión: el efecto solo se suscribe a un sistema externo (Supabase Auth) y
  // actualiza el estado desde los callbacks, nunca de forma síncrona.
  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      usuarioVisto.current ??= data.session?.user.id ?? null;
      setSession(data.session);
      setSessionReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionReady(true);
      // Al cambiar de usuario, nada de la caché anterior sigue siendo válido.
      // SOLO entonces: Supabase repite SIGNED_IN y TOKEN_REFRESHED cada vez que
      // la pestaña vuelve a primer plano, y en el celular eso pasa al volver del
      // selector de archivos o de WhatsApp. Vaciar la caché ahí desmontaba la
      // pantalla entera y el formulario perdía lo escrito (y el logo recién
      // subido quedaba huérfano).
      const usuario = next?.user.id ?? null;
      if (usuarioVisto.current !== undefined && usuarioVisto.current !== usuario) {
        queryClient.clear();
      }
      usuarioVisto.current = usuario;
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  // Membresías del usuario. El filtro por `user_id` es obligatorio: la RLS le
  // deja ver al dueño y al admin las membresías de TODO su equipo (para la
  // pantalla de Equipo), así que sin él las del coach y los atletas llegaban
  // como si fueran boxes propios, y el box activo podía quedar con el rol de
  // otra persona.
  const userId = session?.user.id;
  const membershipsQuery = useQuery({
    queryKey: ['memberships', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<MembershipWithOrg[]> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, organizations(*)')
        .eq('user_id', userId as string)
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []) as unknown as MembershipWithOrg[];
    },
  });

  const memberships = useMemo(() => membershipsQuery.data ?? [], [membershipsQuery.data]);

  const setActiveOrg = useCallback((orgId: string) => {
    setActiveOrgId(orgId);
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(ACTIVE_ORG_KEY);
    setActiveOrgId(null);
  }, []);

  /**
   * Box activo, por orden de prioridad:
   *   1. el del subdominio, si el usuario pertenece a él
   *   2. el que eligió antes
   *   3. el primero que tenga
   */
  const activeMembership = useMemo(() => {
    if (memberships.length === 0) return null;
    const slug = slugFromHost();
    if (slug) {
      const bySlug = memberships.find((m) => m.organizations?.slug === slug);
      if (bySlug) return bySlug;
    }
    if (activeOrgId) {
      const stored = memberships.find((m) => m.org_id === activeOrgId);
      if (stored) return stored;
    }
    return memberships[0];
  }, [memberships, activeOrgId]);

  const value: AuthState = useMemo(
    () => ({
      session,
      loading: !sessionReady || (Boolean(session) && membershipsQuery.isPending),
      memberships,
      activeMembership,
      error: membershipsQuery.error ? String(membershipsQuery.error) : null,
      setActiveOrg,
      signOut,
    }),
    [
      session,
      sessionReady,
      membershipsQuery.isPending,
      membershipsQuery.error,
      memberships,
      activeMembership,
      setActiveOrg,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
