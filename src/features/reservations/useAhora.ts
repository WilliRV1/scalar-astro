import { useEffect, useState } from 'react';

/**
 * El reloj de la pantalla de reservas.
 *
 * Hace falta un "ahora" que sea estable dentro de un render —llamar a
 * `new Date()` en medio del render da resultados distintos en cada repintado y
 * el linter lo bloquea— pero que además AVANCE mientras la pantalla está
 * abierta. Las dos cosas importan aquí: el atleta deja el celular en la banca
 * cinco minutos, y en esos cinco minutos se cierra la ventana de reserva de la
 * clase de las 6. Sin esto seguiría viendo un botón "Reservar" que ya no
 * funciona.
 *
 * El `setInterval` vive en el efecto y el estado se cambia desde su callback,
 * no de forma síncrona dentro del efecto.
 */
export function useAhora(intervaloMs = 30_000): Date {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return ahora;
}
