import { Link } from 'react-router-dom';
import { Card, ErrorNote, Spinner, Stat } from '../../shared/ui';
import { useAthletes } from '../athletes/queries';
import { mensaje } from './errores';
import { Nota } from './piezas';

/**
 * Los atletas, dentro del asistente.
 *
 * No hay formulario aquí: el importador y la ficha del atleta ya existen y son
 * mejores que cualquier versión recortada que quepa en un paso. Este paso lleva
 * a uno de los dos y, sobre todo, DICE CUÁNTOS HAY: es lo que le permite al
 * dueño darse cuenta de que el Excel se subió a medias.
 */
export function SeccionAtletas({ orgId }: { orgId: string }) {
  const { data, isLoading, error } = useAthletes(orgId);

  if (isLoading) return <Spinner label="Contando tus atletas" />;
  if (error) return <ErrorNote>No se pudo contar a tus atletas: {mensaje(error)}</ErrorNote>;

  // La consulta trae como mucho 500: por encima de eso el número exacto no le
  // sirve a nadie y decir "500" a secas sería mentira.
  const total = data?.length ?? 0;
  const texto = total >= 500 ? '500+' : String(total);

  return (
    <div className="space-y-4">
      <Stat
        label="Atletas en tu box"
        value={texto}
        hint={total === 0 ? 'Todavía ninguno' : 'Los que ya están cargados'}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/coach/importar" className="block">
          <Card className="h-full transition hover:border-primary">
            <p className="font-display text-2xl text-black dark:text-white">Subir mi Excel</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              La lista que ya tienes, como la tengas. Te dejamos emparejar tus columnas con las
              nuestras y te mostramos qué va a entrar antes de guardar nada.
            </p>
          </Card>
        </Link>

        <Link to="/coach/atletas" className="block">
          <Card className="h-full transition hover:border-primary">
            <p className="font-display text-2xl text-black dark:text-white">Crearlos a mano</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Si son pocos o estás arrancando. Con el nombre y el teléfono basta para empezar a
              cobrarles.
            </p>
          </Card>
        </Link>
      </div>

      <Nota>
        Tener el teléfono de alguien en una lista no es lo mismo que tener su permiso para
        escribirle. Cuando importes, marca solo a quien de verdad te autorizó: la fecha de ese
        permiso es la prueba que te piden si alguien reclama.
      </Nota>
    </div>
  );
}
