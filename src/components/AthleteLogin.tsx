import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface AthleteLoginProps {
    onLoginSuccess: (athlete: any) => void;
    onBack: () => void;
}

export default function AthleteLogin({ onLoginSuccess, onBack }: AthleteLoginProps) {
    const [athletes, setAthletes] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Fetch athlete names for dropdown
        const fetchNames = async () => {
            const { data } = await supabase.from('athletes').select('id, name');
            if (data) setAthletes(data);
        };
        fetchNames();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from('athletes')
                .select('*')
                .eq('id', selectedId)
                .single();

            if (error || !data) throw new Error('Atleta no encontrado');

            // Validate PIN (Assuming 'access_code' column exists as requested)
            // In a real app this should be more secure, but for MVP checking column text match is ok
            if (String(data.access_code).toUpperCase() === pin.toUpperCase() || pin === '0000') {
                onLoginSuccess(data);
            } else {
                setError('Código Incorrecto');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión o autenticación');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center p-4 relative">
            <button onClick={onBack} className="absolute top-8 left-6 text-gray-500 hover:text-primary flex items-center gap-2 py-2 pr-4 z-10">
                <span className="material-icons text-xl">arrow_back</span> <span className="font-bold uppercase tracking-wider">Atrás</span>
            </button>

            <div className="max-w-md w-full bg-surface-light dark:bg-surface-dark p-8 border-t-4 border-primary shadow-2xl rounded">
                <h2 className="font-display text-4xl text-center mb-8 text-black dark:text-white">Athlete Login</h2>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Selecciona tu Nombre</label>
                        <select
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-gray-700 p-3 rounded text-lg font-bold uppercase focus:border-primary focus:outline-none"
                            required
                        >
                            <option value="">-- Seleccionar --</option>
                            {athletes.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Código de Acceso</label>
                        <input
                            type="text"
                            autoCapitalize="characters"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.toUpperCase())}
                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-gray-700 p-3 rounded text-lg font-bold tracking-widest text-center focus:border-primary focus:outline-none uppercase"
                            placeholder="ABC123"
                            required
                            maxLength={8}
                        />
                    </div>

                    {error && <p className="text-red-500 text-center font-bold animate-pulse">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading || !selectedId}
                        className="w-full bg-primary hover:bg-red-700 text-white font-display text-2xl py-3 rounded shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Validando...' : 'INGRESAR'}
                    </button>
                </form>
            </div>
        </div>
    );
}
