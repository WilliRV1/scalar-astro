import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import ExcelImport from './ExcelImport';

// ─── Types ───────────────────────────────────────────────────────────
type Athlete = {
    id: string;
    name: string;
    avatar_url: string | null;
    payment_status: 'active' | 'pending';
    cut_day: string;
    referral_source: string;
    back_squat: string;
    bench_press: string;
    deadlift: string;
    shoulder_press: string;
    front_squat: string;
    clean_rm: string;
    snatch_rm: string;
    push_press: string;
    karen: string;
    burpees_100: string;
    access_code: string;
};

type FilterMode = 'all' | 'active' | 'pending';

// ─── Constants ───────────────────────────────────────────────────────
const LIFTS = [
    { key: 'back_squat', label: 'Back Squat', short: 'B.SQ', icon: '🏋️', unit: 'kg' },
    { key: 'bench_press', label: 'Bench Press', short: 'BCH', icon: '💪', unit: 'kg' },
    { key: 'deadlift', label: 'Deadlift', short: 'DL', icon: '⚡', unit: 'kg' },
    { key: 'shoulder_press', label: 'Sh. Press', short: 'SHP', icon: '🔥', unit: 'kg' },
    { key: 'front_squat', label: 'Front Squat', short: 'FSQ', icon: '🦵', unit: 'kg' },
    { key: 'clean_rm', label: 'Clean', short: 'CLN', icon: '🏅', unit: 'kg' },
    { key: 'snatch_rm', label: 'Snatch', short: 'SNT', icon: '🏋️‍♀️', unit: 'kg' },
    { key: 'push_press', label: 'Push Press', short: 'PP', icon: '🚀', unit: 'kg' },
] as const;

const BENCHMARKS = [
    { key: 'karen', label: 'Karen', short: 'KRN', icon: '⏱️', unit: 'min' },
    { key: 'burpees_100', label: '100 Burpees', short: 'BRP', icon: '💥', unit: 'min' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────
const vibrate = (ms: number) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
};

const getAccent = (name: string) => {
    const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const accents = [
        { text: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500', ring: 'ring-red-500/30', gradient: 'from-red-600/20 via-red-900/5' },
        { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500', ring: 'ring-blue-500/30', gradient: 'from-blue-600/20 via-blue-900/5' },
        { text: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500', ring: 'ring-purple-500/30', gradient: 'from-purple-600/20 via-purple-900/5' },
        { text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500', ring: 'ring-emerald-500/30', gradient: 'from-emerald-600/20 via-emerald-900/5' },
        { text: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500', ring: 'ring-amber-500/30', gradient: 'from-amber-600/20 via-amber-900/5' },
        { text: 'text-rose-400', border: 'border-rose-500/30', bg: 'bg-rose-500', ring: 'ring-rose-500/30', gradient: 'from-rose-600/20 via-rose-900/5' },
        { text: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500', ring: 'ring-sky-500/30', gradient: 'from-sky-600/20 via-sky-900/5' },
        { text: 'text-lime-400', border: 'border-lime-500/30', bg: 'bg-lime-500', ring: 'ring-lime-500/30', gradient: 'from-lime-600/20 via-lime-900/5' },
    ];
    return accents[h % accents.length];
};

// ─── Edit Drawer (Full-screen mobile form) ───────────────────────────
function EditDrawer({ athlete, accent, onSave, onClose, onDelete, onToast }: {
    athlete: Athlete;
    accent: ReturnType<typeof getAccent>;
    onSave: (updates: Partial<Athlete>) => void;
    onClose: () => void;
    onDelete: () => void;
    onToast: (msg: string) => void;
}) {
    const [form, setForm] = useState({ ...athlete });
    const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

    const handleSave = () => {
        const changes: Partial<Athlete> = {};
        for (const key of Object.keys(form) as (keyof Athlete)[]) {
            if (form[key] !== athlete[key]) (changes as any)[key] = form[key];
        }
        if (Object.keys(changes).length > 0) onSave(changes);
        onClose();
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="bg-surface-dark w-full sm:w-[480px] sm:max-h-[85vh] max-h-[92vh] rounded-t-2xl sm:rounded-2xl overflow-y-auto border border-gray-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drawer Header */}
                <div className="sticky top-0 z-10 bg-surface-dark/95 backdrop-blur-lg border-b border-gray-800 px-5 py-4 flex items-center justify-between">
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 -ml-1">
                        <span className="material-icons">close</span>
                    </button>
                    <h2 className="font-display text-lg uppercase tracking-wider text-white">Editar Atleta</h2>
                    <button onClick={handleSave}
                        className="bg-primary hover:bg-red-700 text-white text-sm font-bold uppercase px-4 py-1.5 rounded-full shadow-lg shadow-red-900/20 active:scale-95 transition-all flex items-center gap-2">
                        <span className="material-icons text-sm">save</span>
                        Guardar
                    </button>
                </div>

                <div className="p-5 space-y-6">
                    {/* Name & Info */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <div className={`w-1 h-5 rounded-full ${accent.bg}`} />
                            <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">Información</span>
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">Nombre</label>
                            <input className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-xl text-base focus:outline-none focus:border-primary transition-colors"
                                value={form.name} onChange={e => set('name', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">Código de Acceso</label>
                                <div className="relative">
                                    <input className="w-full bg-black border border-gray-700 text-white px-4 py-3 pr-10 rounded-xl text-base focus:outline-none focus:border-primary transition-colors font-mono"
                                        value={form.access_code} onChange={e => set('access_code', e.target.value)} placeholder="Ej: SC-001" />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(form.access_code);
                                            vibrate(10);
                                            onToast('Código copiado');
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-primary transition-colors"
                                    >
                                        <span className="material-icons text-sm">content_copy</span>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">Día de Corte</label>
                                <input className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-xl text-base focus:outline-none focus:border-primary transition-colors"
                                    value={form.cut_day} onChange={e => set('cut_day', e.target.value)} placeholder="01-31" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">Como Llegó</label>
                            <input className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-xl text-base focus:outline-none focus:border-primary transition-colors"
                                value={form.referral_source} onChange={e => set('referral_source', e.target.value)} placeholder="Instagram, Referido..." />
                        </div>
                    </div>

                    {/* Lifts */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1 h-5 rounded-full bg-emerald-500" />
                            <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">Levantamientos (kg)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {LIFTS.map(lift => (
                                <div key={lift.key}>
                                    <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">
                                        {lift.icon} {lift.label}
                                    </label>
                                    <input
                                        className="w-full bg-black border border-gray-700 text-white px-4 py-3 rounded-xl text-base focus:outline-none focus:border-emerald-500 transition-colors text-center font-display text-lg"
                                        value={(form as any)[lift.key] || ''}
                                        onChange={e => set(lift.key, e.target.value)}
                                        placeholder="—"
                                        inputMode="numeric"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Benchmarks */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1 h-5 rounded-full bg-amber-500" />
                            <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">Benchmarks</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {BENCHMARKS.map(bm => (
                                <div key={bm.key}>
                                    <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">
                                        {bm.icon} {bm.label}
                                    </label>
                                    <input
                                        className="w-full bg-black border border-amber-500/20 text-white px-4 py-3 rounded-xl text-base focus:outline-none focus:border-amber-500 transition-colors text-center font-display text-lg"
                                        value={(form as any)[bm.key] || ''}
                                        onChange={e => set(bm.key, e.target.value)}
                                        placeholder="—"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="pt-4 border-t border-gray-800">
                        <button onClick={() => { if (confirm('¿Eliminar este atleta permanentemente?')) { onDelete(); onClose(); } }}
                            className="w-full flex items-center justify-center gap-2 text-red-400/60 hover:text-red-400 text-sm py-3 transition-colors">
                            <span className="material-icons text-sm">delete_outline</span>
                            Eliminar Atleta
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ═════════════════════════════════════════════════════════════════════
// ─── Main Component ──────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════
export default function CoachDashboard() {
    const [athletes, setAthletes] = useState<Athlete[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<FilterMode>('all');
    const [showExcelImport, setShowExcelImport] = useState(false);
    const [editingAthlete, setEditingAthlete] = useState<Athlete | null>(null);
    const [sortBy, setSortBy] = useState<'name' | 'payment'>('name');
    const [toast, setToast] = useState<string | null>(null);

    // Simple toast timer
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    useEffect(() => { fetchData(); }, []);

    async function fetchData() {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('athletes').select('*');
            if (error) throw error;
            if (data) setAthletes(data);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    // ─── Filtering & Sorting ─────────────────────────────────────
    const filtered = athletes
        .filter(a => {
            if (filter === 'active') return a.payment_status === 'active';
            if (filter === 'pending') return a.payment_status === 'pending';
            return true;
        })
        .filter(a => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === 'payment') {
                if (a.payment_status !== b.payment_status) return a.payment_status === 'pending' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

    // ─── CRUD Operations ─────────────────────────────────────────
    const updateAthlete = useCallback(async (id: string, updates: Partial<Athlete>) => {
        const prev = [...athletes];
        setAthletes(c => c.map(a => a.id === id ? { ...a, ...updates } : a));
        try {
            const { error } = await supabase.from('athletes').update(updates).eq('id', id);
            if (error) throw error;
        } catch (error) {
            console.error('Error updating:', error);
            setAthletes(prev);
        }
    }, [athletes]);

    const addAthlete = async () => {
        vibrate(20);
        const newAthlete = {
            name: 'Nuevo Atleta', avatar_url: null, payment_status: 'pending' as const,
            cut_day: '', referral_source: '', back_squat: '', bench_press: '',
            deadlift: '', shoulder_press: '', front_squat: '', clean_rm: '', snatch_rm: '',
            push_press: '', karen: '', burpees_100: '', access_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        };
        const tempId = crypto.randomUUID() as string;
        const optimistic = { ...newAthlete, id: tempId } as Athlete;
        setAthletes(prev => [...prev, optimistic]);
        setEditingAthlete(optimistic); // Open drawer immediately with optimistic ID

        try {
            const { data, error } = await supabase.from('athletes').insert([newAthlete]).select().single();
            if (error) throw error;
            if (data) {
                setAthletes(c => c.map(a => a.id === tempId ? data : a));
                setEditingAthlete(data);
            }
        } catch (error) {
            console.error('Error adding:', error);
            setEditingAthlete(optimistic);
        }
    };

    const deleteAthlete = async (id: string) => {
        vibrate(50);
        const prev = [...athletes];
        setAthletes(c => c.filter(a => a.id !== id));
        try {
            const { error } = await supabase.from('athletes').delete().eq('id', id);
            if (error) throw error;
        } catch (error) {
            console.error('Error deleting:', error);
            setAthletes(prev);
        }
    };

    const togglePayment = (id: string, current: string) => {
        vibrate(10);
        updateAthlete(id, { payment_status: current === 'active' ? 'pending' : 'active' } as Partial<Athlete>);
    };

    // ─── Excel Import ────────────────────────────────────────────
    const handleExcelImport = async (importedAthletes: any[]) => {
        setShowExcelImport(false);
        try {
            const toInsert = importedAthletes.map(a => ({
                name: a.name || 'Sin Nombre', payment_status: 'pending', avatar_url: null,
                cut_day: a.cut_day || '', referral_source: a.referral_source || '',
                back_squat: a.back_squat || '', bench_press: a.bench_press || '',
                deadlift: a.deadlift || '', shoulder_press: a.shoulder_press || '',
                front_squat: a.front_squat || '', clean_rm: a.clean_rm || '', snatch_rm: a.snatch_rm || '',
                push_press: a.push_press || '', karen: a.karen || '', burpees_100: a.burpees_100 || '',
                access_code: a.access_code || Math.random().toString(36).substring(2, 8).toUpperCase(),
            }));
            const { error } = await supabase.from('athletes').insert(toInsert);
            if (error) throw error;
            fetchData();
        } catch (error) {
            console.error('Error importing:', error);
            fetchData();
        }
    };

    // ─── Stats ───────────────────────────────────────────────────
    const totalCount = athletes.length;
    const activeCount = athletes.filter(a => a.payment_status === 'active').length;
    const pendingCount = athletes.filter(a => a.payment_status === 'pending').length;

    // Count how many PRs an athlete has filled in
    const prCount = (a: Athlete) => {
        return [...LIFTS, ...BENCHMARKS].filter(f => (a as any)[f.key]).length;
    };

    return (
        <div className="flex-grow max-w-3xl mx-auto w-full pb-24 relative">

            {/* ─── Sticky Search & Filter Bar ─────────────────────── */}
            <div className="sticky top-0 z-40 bg-background-dark/95 backdrop-blur-lg border-b border-gray-800/50 px-4 pt-4 pb-3 space-y-3">
                {/* Search */}
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                        <span className="material-icons text-gray-500 text-xl">search</span>
                    </span>
                    <input
                        className="w-full bg-surface-dark border border-gray-800 text-white text-sm rounded-xl pl-11 pr-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary placeholder-gray-600 transition-colors"
                        placeholder="Buscar atleta..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-500 hover:text-white">
                            <span className="material-icons text-lg">close</span>
                        </button>
                    )}
                </div>

                {/* Filter Pills + Stats */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {([
                        { key: 'all', label: 'Todos', count: totalCount, color: 'gray' },
                        { key: 'active', label: 'Activos', count: activeCount, color: 'emerald' },
                        { key: 'pending', label: 'Pendientes', count: pendingCount, color: 'red' },
                    ] as const).map(f => (
                        <button
                            key={f.key}
                            onClick={() => { vibrate(5); setFilter(f.key); }}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all shrink-0 ${filter === f.key
                                ? f.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                    : f.color === 'red' ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                        : 'bg-white/10 text-white border border-white/20'
                                : 'text-gray-500 border border-transparent hover:text-gray-300'
                                }`}
                        >
                            {f.label}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === f.key ? 'bg-white/10' : 'bg-gray-800'}`}>
                                {f.count}
                            </span>
                        </button>
                    ))}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Sort Toggle */}
                    <button
                        onClick={() => setSortBy(s => s === 'name' ? 'payment' : 'name')}
                        className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs px-2 py-1.5 rounded-lg transition-colors shrink-0"
                        title="Ordenar"
                    >
                        <span className="material-icons text-sm">sort</span>
                        <span className="hidden sm:inline uppercase tracking-wider font-bold">{sortBy === 'name' ? 'A-Z' : 'Pago'}</span>
                    </button>

                    {/* Import Button */}
                    <button onClick={() => setShowExcelImport(true)}
                        className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 text-xs px-2 py-1.5 rounded-lg transition-colors shrink-0"
                        title="Importar Excel"
                    >
                        <span className="material-icons text-sm">upload_file</span>
                        <span className="hidden sm:inline uppercase tracking-wider font-bold">Excel</span>
                    </button>
                </div>
            </div>

            {/* ─── Athlete List ────────────────────────────────────── */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-gray-500 font-display text-xl uppercase">Cargando...</p>
                    </div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                    <span className="material-icons text-5xl text-gray-700 mb-4">
                        {searchQuery ? 'search_off' : 'group_off'}
                    </span>
                    <p className="text-gray-500 font-display text-xl uppercase mb-2">
                        {searchQuery ? 'Sin resultados' : 'Sin atletas'}
                    </p>
                    <p className="text-gray-600 text-sm mb-6">
                        {searchQuery ? `No se encontró "${searchQuery}"` : 'Agrega tu primer atleta con el botón +'}
                    </p>
                    {!searchQuery && (
                        <button
                            onClick={async () => {
                                vibrate(20);
                                const sampleNames = ['Juan Pérez', 'María García', 'Carlos Ruiz', 'Ana López'];
                                for (const name of sampleNames) {
                                    await supabase.from('athletes').insert([{
                                        name, payment_status: 'pending', cut_day: '15', referral_source: 'Instagram',
                                        back_squat: '100', bench_press: '80', deadlift: '140', shoulder_press: '50',
                                        front_squat: '90', clean_rm: '70', snatch_rm: '55', push_press: '65',
                                        karen: '8:45', burpees_100: '7:30', access_code: Math.random().toString(36).substring(2, 8).toUpperCase()
                                    }]);
                                }
                                fetchData();
                            }}
                            className="flex items-center gap-2 bg-surface-dark border border-gray-700 text-gray-400 px-6 py-2.5 rounded-xl hover:text-white hover:border-primary transition-all active:scale-95"
                        >
                            <span className="material-icons text-sm">auto_awesome</span>
                            Crear Atletas de Prueba
                        </button>
                    )}
                </div>
            ) : (
                <div className="px-4 pt-4 space-y-3">
                    <AnimatePresence>
                        {filtered.map((athlete, i) => {
                            const accent = getAccent(athlete.name);
                            const filledPRs = prCount(athlete);
                            const totalPRs = LIFTS.length + BENCHMARKS.length;

                            return (
                                <motion.div
                                    key={athlete.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -100 }}
                                    transition={{ duration: 0.25, delay: i * 0.03 }}
                                    className={`relative bg-surface-dark border border-gray-800 rounded-xl overflow-hidden active:scale-[0.98] transition-transform`}
                                    onClick={() => { vibrate(5); setEditingAthlete(athlete); }}
                                >
                                    {/* Subtle accent gradient */}
                                    <div className={`absolute inset-0 bg-gradient-to-r ${accent.gradient} to-transparent opacity-60 pointer-events-none`} />

                                    <div className="relative p-4 flex items-center gap-3">
                                        {/* Avatar */}
                                        <div className="relative shrink-0">
                                            <div className={`w-12 h-12 rounded-xl overflow-hidden ring-1 ${accent.ring} ring-offset-1 ring-offset-surface-dark`}>
                                                <img
                                                    alt={athlete.name}
                                                    className="w-full h-full object-cover"
                                                    src={athlete.avatar_url || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(athlete.name)}&backgroundColor=1a1a1a&textColor=ffffff`}
                                                />
                                            </div>
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface-dark ${athlete.payment_status === 'active' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-display text-lg text-white truncate leading-tight">{athlete.name}</h3>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {/* Payment status pill */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); togglePayment(athlete.id, athlete.payment_status); }}
                                                    className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-all ${athlete.payment_status === 'pending'
                                                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                        }`}
                                                >
                                                    {athlete.payment_status === 'pending' ? '⚠ Pendiente' : '✓ Activo'}
                                                </button>
                                                {athlete.access_code && (
                                                    <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded border border-gray-800 shrink-0">
                                                        <span className="text-[8px] text-gray-500 font-bold">KEY:</span>
                                                        <span className="text-[10px] text-primary font-mono font-bold tracking-tight">{athlete.access_code}</span>
                                                    </div>
                                                )}
                                                {athlete.cut_day && (
                                                    <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                                        Día <span className="text-gray-400">{athlete.cut_day}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Quick PRs Preview */}
                                        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                                            {[
                                                { k: 'back_squat', l: 'SQ' },
                                                { k: 'deadlift', l: 'DL' },
                                                { k: 'clean_rm', l: 'CL' },
                                            ].map(pr => (
                                                <div key={pr.k} className="text-center px-2">
                                                    <span className="block text-[8px] text-gray-600 uppercase font-bold">{pr.l}</span>
                                                    <span className="font-display text-sm text-white">{(athlete as any)[pr.k] || '—'}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* PR completion indicator + chevron */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            {/* Mini progress bar */}
                                            <div className="w-7 h-7 relative" title={`${filledPRs}/${totalPRs} PRs`}>
                                                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-800" />
                                                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3"
                                                        className={filledPRs === totalPRs ? 'text-emerald-500' : 'text-primary'}
                                                        strokeDasharray={`${(filledPRs / totalPRs) * 94.25} 94.25`}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-400">{filledPRs}</span>
                                            </div>
                                            <span className="material-icons text-gray-700 text-lg">chevron_right</span>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* ─── FAB (Floating Action Button) ───────────────────── */}
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                onClick={addAthlete}
                className="fixed bottom-6 right-6 w-14 h-14 bg-primary hover:bg-red-700 rounded-full shadow-xl shadow-red-900/40 flex items-center justify-center text-white active:scale-90 transition-transform z-50"
            >
                <span className="material-icons text-2xl">add</span>
            </motion.button>

            {/* ─── Edit Drawer ────────────────────────────────────── */}
            <AnimatePresence>
                {editingAthlete && (
                    <EditDrawer
                        key={editingAthlete.id}
                        athlete={editingAthlete}
                        accent={getAccent(editingAthlete.name)}
                        onSave={(updates) => updateAthlete(editingAthlete.id, updates)}
                        onClose={() => setEditingAthlete(null)}
                        onDelete={() => deleteAthlete(editingAthlete.id)}
                        onToast={(msg) => setToast(msg)}
                    />
                )}
            </AnimatePresence>

            {/* ─── Excel Import Modal ─────────────────────────────── */}
            {showExcelImport && (
                <ExcelImport onImport={handleExcelImport} onClose={() => setShowExcelImport(false)} />
            )}

            {/* ─── Simple Toast ───────────────────────────────────── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-surface-dark border border-gray-800 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 pointer-events-none"
                    >
                        <span className="material-icons text-emerald-500 text-sm">check_circle</span>
                        <span className="text-sm font-bold uppercase tracking-wider">{toast}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
