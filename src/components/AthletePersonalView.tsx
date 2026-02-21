import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';

interface AthletePersonalViewProps {
    athlete: any;
    onLogout: () => void;
}

const PR_FIELDS = [
    { key: 'back_squat', label: 'Back Squat', icon: '🏋️', unit: 'KG' },
    { key: 'bench_press', label: 'Bench Press', icon: '💪', unit: 'KG' },
    { key: 'deadlift', label: 'Deadlift', icon: '⚡', unit: 'KG' },
    { key: 'shoulder_press', label: 'Shoulder Press', icon: '🔥', unit: 'KG' },
    { key: 'front_squat', label: 'Front Squat', icon: '🦵', unit: 'KG' },
    { key: 'clean_rm', label: 'Clean', icon: '🏅', unit: 'KG' },
    { key: 'snatch_rm', label: 'Snatch', icon: '🏋️‍♀️', unit: 'KG' },
    { key: 'push_press', label: 'Push Press', icon: '🚀', unit: 'KG' },
];

const BENCHMARK_FIELDS = [
    { key: 'karen', label: 'Karen', icon: '⏱️' },
    { key: 'burpees_100', label: '100 Burpees', icon: '🔥' },
];

// ─── Sparkline Component ─────────────────────────────────────────────
function Sparkline({ data }: { data: string[] }) {
    if (data.length < 2) return null;

    // Parse values (times like 8:30 need special handling, but numbers are fine)
    const values = data.map(v => {
        if (v.includes(':')) {
            const [min, sec] = v.split(':').map(Number);
            return (min * 60) + sec;
        }
        return parseFloat(v) || 0;
    }).slice(-10); // Last 10 points

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const padding = 2;

    // Create points for SVG polyline
    const width = 80;
    const height = 20;
    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        // Invert Y because SVG coordinates
        const y = height - padding - ((v - min) / range) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(' ');

    const trend = values[values.length - 1] > values[0] ? 'up' : 'down';
    // For times (benchmarks), down is usually good. For lifts, up is good.
    // Simplifying: emerald for recent > first, otherwise red (basic visual cue)
    const color = trend === 'up' ? '#10b981' : '#ef4444';

    return (
        <svg width={width} height={height} className="mt-2 opacity-60">
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
            />
        </svg>
    );
}

export default function AthletePersonalView({ athlete, onLogout }: AthletePersonalViewProps) {
    const [energy, setEnergy] = useState(3);
    const [rpe, setRpe] = useState(5);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        const fetchHistory = async () => {
            const { data } = await supabase
                .from('athlete_progress')
                .select('*')
                .eq('athlete_id', athlete.id)
                .order('created_at', { ascending: true });
            if (data) setHistory(data);
        };
        fetchHistory();
    }, [athlete.id]);

    const vibrate = (ms: number) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
    };

    const handleCheckIn = async () => {
        setSaving(true);
        try {
            const { error } = await supabase.from('workout_logs').insert([
                {
                    athlete_id: athlete.id,
                    energy,
                    rpe,
                    notes,
                    date: new Date().toISOString()
                }
            ]);

            if (error) throw error;

            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#FF0000', '#FFFFFF', '#000000']
            });

            alert('WOD Registrado con Éxito!');
            setNotes('');
        } catch (err) {
            console.error(err);
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 flex flex-col">
            {/* Header */}
            <header className="bg-surface-dark border-b border-gray-800 p-4 shadow-lg flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                        {athlete.avatar_url ? (
                            <img alt="Avatar" className="w-full h-full object-cover" src={athlete.avatar_url} />
                        ) : (
                            <span className="font-display text-lg text-primary">{athlete.name?.charAt(0)}</span>
                        )}
                    </div>
                    <div>
                        <span className="text-[10px] uppercase text-gray-500 font-bold block tracking-wider">Hola,</span>
                        <h1 className="font-display text-xl md:text-2xl leading-none text-white">{athlete.name}</h1>
                    </div>
                </div>
                <button onClick={onLogout} className="text-xs font-bold uppercase border border-gray-700 px-3 py-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                    Salir
                </button>
            </header>

            <main className="flex-grow max-w-lg mx-auto w-full p-4 space-y-5">

                {/* PRs Grid */}
                <div className="bg-surface-dark border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                    <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-3">
                        <h2 className="font-display text-lg text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                            <span className="material-icons text-sm">fitness_center</span>
                            MIS LEVANTAMIENTOS
                        </h2>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-gray-800/50 p-px">
                        {PR_FIELDS.map((field, i) => {
                            const value = athlete[field.key];
                            return (
                                <motion.div
                                    key={field.key}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className={`bg-surface-dark p-4 flex flex-col items-center justify-center ${i === PR_FIELDS.length - 1 && PR_FIELDS.length % 2 !== 0 ? 'col-span-2' : ''}`}
                                >
                                    <span className="text-lg mb-1">{field.icon}</span>
                                    <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">{field.label}</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="font-display text-2xl text-white">{value || '—'}</span>
                                        {value && <span className="text-[10px] text-gray-500">{field.unit}</span>}
                                    </div>
                                    <Sparkline data={history.filter(h => h.field_name === field.key).map(h => h.value)} />
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* Benchmarks */}
                <div className="bg-surface-dark border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3">
                        <h2 className="font-display text-lg text-amber-400 uppercase tracking-wider flex items-center gap-2">
                            <span className="material-icons text-sm">timer</span>
                            BENCHMARKS
                        </h2>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-gray-800/50 p-px">
                        {BENCHMARK_FIELDS.map((field, i) => {
                            const value = athlete[field.key];
                            return (
                                <motion.div
                                    key={field.key}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 + i * 0.05 }}
                                    className="bg-surface-dark p-4 flex flex-col items-center justify-center"
                                >
                                    <span className="text-lg mb-1">{field.icon}</span>
                                    <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">{field.label}</span>
                                    <span className="font-display text-2xl text-white">{value || '—'}</span>
                                    <Sparkline data={history.filter(h => h.field_name === field.key).map(h => h.value)} />
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* Daily Check-in */}
                <div className="bg-surface-dark border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                    <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3">
                        <h2 className="font-display text-lg text-blue-400 uppercase tracking-wider flex items-center gap-2">
                            <span className="material-icons text-sm">check_circle</span>
                            DAILY CHECK-IN
                        </h2>
                    </div>
                    <div className="p-5 space-y-5">
                        {/* Energy Selector */}
                        <div>
                            <label className="block text-xs uppercase font-bold text-gray-500 mb-3 tracking-wide">Energía</label>
                            <div className="flex justify-between">
                                {[1, 2, 3, 4, 5].map(lvl => (
                                    <button
                                        key={lvl}
                                        onClick={() => { vibrate(5); setEnergy(lvl); }}
                                        className={`w-14 h-14 flex items-center justify-center rounded-xl transition-all transform ${energy === lvl
                                            ? 'scale-110 bg-primary/20 border-2 border-primary shadow-lg shadow-primary/20'
                                            : 'opacity-40 grayscale hover:opacity-80 hover:grayscale-0 border-2 border-transparent'
                                            }`}
                                    >
                                        <span className="text-2xl">{['💀', '😫', '😐', '🙂', '⚡'][lvl - 1]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* RPE Slider */}
                        <div>
                            <label className="block text-xs uppercase font-bold text-gray-500 mb-3 tracking-wide">
                                RPE (Esfuerzo): <span className="text-primary text-lg font-display">{rpe}</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={rpe}
                                onChange={(e) => setRpe(Number(e.target.value))}
                                className="w-full accent-primary h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] uppercase text-gray-600 font-bold mt-1">
                                <span>Easy</span>
                                <span>Max Effort</span>
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-xs uppercase font-bold text-gray-500 mb-2 tracking-wide">Notas del WOD</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full bg-black border border-gray-800 p-3 rounded-lg text-sm focus:border-primary focus:outline-none min-h-[80px] text-gray-300 placeholder-gray-700"
                                placeholder="Cómo te sentiste hoy?..."
                            />
                        </div>

                        <button
                            onClick={() => { vibrate(20); handleCheckIn(); }}
                            disabled={saving}
                            className="w-full bg-primary hover:bg-red-700 text-white font-display text-xl py-4 rounded-xl shadow-lg shadow-red-900/30 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {saving ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span className="material-icons">check_circle</span>
                                    REGISTRAR WOD
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
