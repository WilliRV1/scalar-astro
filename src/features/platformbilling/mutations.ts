import { useMutation } from '@tanstack/react-query';
import { invocar } from '../recurring/mutations';
import type { EnlaceDePagoScalar } from './types';

/**
 * Pide el enlace de Mercado Pago para pagarle a Scalar el periodo que toca.
 * El monto y el periodo los decide la base; aquí solo se abre el enlace.
 */
export function usePagarScalar() {
  return useMutation({
    mutationFn: (orgId: string) =>
      invocar<EnlaceDePagoScalar>('platform-payment-link', { org_id: orgId }),
  });
}
