import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Define the Athlete type based on our database schema
type Athlete = {
    id: string;
    name: string;
    avatar_url: string | null;
    payment_status: 'active' | 'pending';
    cut_day: string;
    snatch_rm: string;
    clean_rm: string;
};

export default function CoachDashboard() {
    const [athletes, setAthletes] = useState<Athlete[]>([]);
    const [loading, setLoading] = useState(true);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [showOnlyTrained, setShowOnlyTrained] = useState(false);

    // Initial data fetch
    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            setLoading(true);

            // Fetch Athletes
            const { data: athletesData, error: athletesError } = await supabase
                .from('athletes')
                .select('*');

            if (athletesError) throw athletesError;
            if (athletesData) setAthletes(athletesData);

            // Fetch Logs (Simple fetch, filter in client to avoid Date format 400 errors)
            const { data: logsData, error: logsError } = await supabase
                .from('workout_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (logsError) {
                console.warn("Log fetch error:", logsError);
            }

            if (logsData) {
                // Filter for 'today' in client side to be safe
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                const todaysLogs = logsData.filter(log => {
                    // Fallback to created_at if date column is empty/missing
                    const logDate = log.date || log.created_at;
                    if (!logDate) return false;

                    // Handle both full ISO strings or simple YYYY-MM-DD strings
                    return logDate.startsWith(today);
                });
                setLogs(todaysLogs);
            } else {
                setLogs([]);
            }

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    const getTodayLog = (athleteId: string) => {
        return logs.find(log => log.athlete_id === athleteId);
    };

    // Derived state for sorting/filtering
    const sortedAthletes = [...athletes].sort((a, b) => {
        if (!showOnlyTrained) return 0; // Default order
        const logA = getTodayLog(a.id);
        const logB = getTodayLog(b.id);
        // Put those with logs first
        if (logA && !logB) return -1;
        if (!logA && logB) return 1;
        return 0;
    }).filter(a => !showOnlyTrained || getTodayLog(a.id));


    // Optimistic Update Helper
    const updateAthlete = async (id: string, updates: Partial<Athlete>) => {
        const previousAthletes = [...athletes];
        setAthletes((current) =>
            current.map((athlete) =>
                athlete.id === id ? { ...athlete, ...updates } : athlete
            )
        );

        try {
            const { error } = await supabase
                .from('athletes')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating athlete:', error);
            setAthletes(previousAthletes);
        }
    };

    // Excel-style Add
    const addAthlete = async () => {
        const newAthlete: Omit<Athlete, 'id'> = {
            name: 'Nuevo Atleta',
            avatar_url: null,
            payment_status: 'pending',
            cut_day: '01',
            snatch_rm: '0',
            clean_rm: '0'
        };

        const tempId = crypto.randomUUID();
        const optimisticAthlete = { ...newAthlete, id: tempId };
        setAthletes([...athletes, optimisticAthlete]);

        try {
            const { data, error } = await supabase
                .from('athletes')
                .insert([newAthlete])
                .select()
                .single();

            if (error) throw error;
            if (data) {
                setAthletes(current => current.map(a => a.id === tempId ? data : a));
            }
        } catch (error) {
            console.error('Error adding athlete:', error);
            setAthletes(current => current.filter(a => a.id !== tempId));
        }
    };

    // Delete Athlete
    const deleteAthlete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este atleta?')) return;

        const previousAthletes = [...athletes];
        setAthletes(current => current.filter(a => a.id !== id));
        setMenuOpenId(null);

        try {
            const { error } = await supabase
                .from('athletes')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error deleting athlete:', error);
            setAthletes(previousAthletes);
        }
    }

    const togglePaymentStatus = (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'pending' : 'active';
        updateAthlete(id, { payment_status: newStatus });
    };

    const handleBlur = (id: string, field: keyof Athlete, value: string) => {
        updateAthlete(id, { [field]: value });
    };

    const pendingCount = athletes.filter(a => a.payment_status === 'pending').length;

    return (
        <div className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full" onClick={() => setMenuOpenId(null)}>
            {/* Header Stats / Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 justify-between items-end md:items-center">
                <div className="w-full md:hidden flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-primary rounded mb-2">
                    <span className="material-icons text-primary animate-pulse">warning</span>
                    <span className="font-display text-lg text-white">{pendingCount} Pending Payments</span>
                </div>

                <div className="relative w-full md:w-96">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <span className="material-icons text-gray-400">search</span>
                    </span>
                    <input
                        className="w-full bg-surface-light dark:bg-surface-dark border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded focus:ring-primary focus:border-primary block pl-10 p-3 uppercase font-bold tracking-wide shadow-sm"
                        placeholder="SEARCH ATHLETE..."
                        type="text"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setShowOnlyTrained(!showOnlyTrained)}
                        className={`flex items-center gap-2 px-5 py-2.5 border transition-all shadow-sm font-bold uppercase tracking-wide text-sm ${showOnlyTrained ? 'bg-primary text-white border-primary' : 'bg-surface-light dark:bg-surface-dark text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-primary'}`}
                    >
                        <span className="material-icons-outlined text-sm">{showOnlyTrained ? 'check_box' : 'check_box_outline_blank'}</span>
                        Filtrar: Entrenaron Hoy
                    </button>
                    <button
                        onClick={addAthlete}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-red-700 text-white text-sm font-bold uppercase tracking-wide transition-all shadow-lg shadow-red-900/20 rounded">
                        <span className="material-icons text-sm">add</span>
                        New Athlete
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center text-white font-display text-2xl animate-pulse">Loading Athletes...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sortedAthletes.map((athlete, index) => {
                        const todayLog = getTodayLog(athlete.id);
                        return (
                            <div
                                key={athlete.id}
                                className={`group relative bg-surface-light dark:bg-surface-dark border-l-[12px] shadow-lg hover:shadow-xl transition-all duration-300 overflow-visible rounded-r ${athlete.payment_status === 'pending'
                                    ? 'border-primary'
                                    : 'border-gray-300 dark:border-gray-800'
                                    }`}
                            >
                                <div className="absolute top-0 right-0 p-2 opacity-50 text-[100px] leading-none font-display text-gray-200 dark:text-gray-800 pointer-events-none -mr-4 -mt-4 z-0">
                                    {(index + 1).toString().padStart(2, '0')}
                                </div>

                                <div className="p-5 relative z-10 flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3 w-full">
                                            {/* Avatar with DiceBear fallback */}
                                            <div className="relative group/avatar">
                                                <div className="w-12 h-12 rounded shrink-0 overflow-hidden">
                                                    <img
                                                        alt="Avatar"
                                                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all"
                                                        src={athlete.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${athlete.name}`}
                                                    />
                                                </div>
                                                {/* FIRE INDICATOR (Now outside overflow-hidden) */}
                                                {todayLog && (
                                                    <div
                                                        tabIndex={0}
                                                        className="absolute -bottom-1 -right-1 bg-surface-light dark:bg-surface-dark rounded-full p-0.5 border border-primary group/tooltip cursor-help z-50 focus:outline-none"
                                                    >
                                                        <span className="text-sm shadow-sm relative z-10">🔥</span>
                                                        {/* Tooltip */}
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-black/95 backdrop-blur border border-primary p-3 rounded shadow-2xl opacity-0 group-hover/tooltip:opacity-100 group-focus/tooltip:opacity-100 transition-opacity pointer-events-none z-50">
                                                            <div className="text-xs text-white space-y-1 font-mono">
                                                                <div className="flex justify-between border-b border-gray-700 pb-1 mb-1">
                                                                    <span className="text-gray-400">ENERGY</span>
                                                                    <span className="text-primary font-bold">{todayLog.energy}/5</span>
                                                                </div>
                                                                <div className="flex justify-between border-b border-gray-700 pb-1 mb-1">
                                                                    <span className="text-gray-400">RPE</span>
                                                                    <span className="text-primary font-bold">{todayLog.rpe}/10</span>
                                                                </div>
                                                                {todayLog.notes && <p className="italic text-gray-300 text-[10px] mt-2">"{todayLog.notes}"</p>}
                                                            </div>
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-primary"></div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-grow min-w-0">
                                                {/* Editable Name Input */}
                                                <input
                                                    className="font-display text-2xl tracking-wide text-black dark:text-white group-hover:text-primary transition-colors uppercase bg-transparent border-b border-transparent hover:border-gray-600 focus:border-primary focus:outline-none w-full"
                                                    defaultValue={athlete.name}
                                                    onBlur={(e) => handleBlur(athlete.id, 'name', e.target.value)}
                                                />
                                                <button
                                                    onClick={() => togglePaymentStatus(athlete.id, athlete.payment_status)}
                                                    className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${athlete.payment_status === 'pending'
                                                        ? 'text-primary bg-primary/10'
                                                        : 'text-green-600 dark:text-green-500'
                                                        }`}
                                                >
                                                    {athlete.payment_status === 'pending' ? 'Payment Pending' : 'Active Member'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Action Menu */}
                                        <div className="relative">
                                            <button
                                                className="text-gray-400 hover:text-white"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMenuOpenId(menuOpenId === athlete.id ? null : athlete.id);
                                                }}
                                            >
                                                <span className="material-icons">more_vert</span>
                                            </button>

                                            {menuOpenId === athlete.id && (
                                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-stone-900 rounded-md shadow-lg z-50 border border-gray-200 dark:border-gray-700 py-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteAthlete(athlete.id);
                                                        }}
                                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                                                    >
                                                        <span className="material-icons text-sm">delete</span>
                                                        Eliminar Atleta
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1 font-bold">
                                            Día de Corte
                                        </label>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-gray-400 font-display text-xl">DAY</span>
                                            <input
                                                className="bg-transparent border-b-2 border-gray-300 dark:border-gray-700 text-2xl font-bold font-display text-black dark:text-white w-16 text-center focus:outline-none focus:border-primary transition-colors p-0"
                                                type="number"
                                                defaultValue={athlete.cut_day}
                                                onBlur={(e) => handleBlur(athlete.id, 'cut_day', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-auto bg-gray-800 dark:bg-chalkboard border-4 border-gray-700 dark:border-gray-900 p-3 shadow-inner rounded-sm relative overflow-hidden">
                                        <div className="absolute inset-0 bg-noise opacity-20 pointer-events-none"></div>
                                        <div className="grid grid-cols-2 gap-4 relative z-10">
                                            <div className="text-center border-r border-gray-600/50">
                                                <span className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1">
                                                    SNATCH RM
                                                </span>
                                                <div className="flex items-center justify-center gap-1 font-chalk text-2xl text-white chalk-text rotate-1">
                                                    <input
                                                        className="bg-transparent w-12 text-center focus:outline-none border-b border-transparent focus:border-white/50"
                                                        defaultValue={athlete.snatch_rm}
                                                        onBlur={(e) => handleBlur(athlete.id, 'snatch_rm', e.target.value)}
                                                    />
                                                    <span className="text-sm font-sans text-gray-400">KG</span>
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <span className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1">
                                                    CLEAN RM
                                                </span>
                                                <div className="flex items-center justify-center gap-1 font-chalk text-2xl text-white chalk-text -rotate-1">
                                                    <input
                                                        className="bg-transparent w-12 text-center focus:outline-none border-b border-transparent focus:border-white/50"
                                                        defaultValue={athlete.clean_rm}
                                                        onBlur={(e) => handleBlur(athlete.id, 'clean_rm', e.target.value)}
                                                    />
                                                    <span className="text-sm font-sans text-gray-400">KG</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    <div
                        onClick={addAthlete}
                        className="min-h-[300px] border-2 border-dashed border-gray-400 dark:border-gray-800 rounded flex flex-col items-center justify-center cursor-pointer hover:border-primary group transition-colors bg-surface-light dark:bg-surface-dark bg-opacity-50"
                    >
                        <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                            <span className="material-icons text-3xl text-gray-400 group-hover:text-white">
                                add
                            </span>
                        </div>
                        <h3 className="font-display text-xl text-gray-500 dark:text-gray-400 group-hover:text-primary">
                            ADD ATHLETE
                        </h3>
                    </div>
                </div>
            )}
        </div>
    );
}
