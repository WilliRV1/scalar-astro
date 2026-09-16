import { useEffect } from 'react';
import { AppRouter } from './app/router';
import { Providers } from './app/providers';

export default function App() {
  // El producto se diseñó en oscuro (un box es oscuro). Se fija aquí hasta que
  // exista preferencia por usuario.
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <Providers>
      <div className="font-body text-gray-900 dark:text-gray-100">
        <AppRouter />
      </div>
    </Providers>
  );
}
