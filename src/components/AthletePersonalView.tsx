import { useState } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '../supabaseClient';

interface AthletePersonalViewProps {
    athlete: any;
    onLogout: () => void;
}

export default function AthletePersonalView({ athlete, onLogout }: AthletePersonalViewProps) {
    const [energy, setEnergy] = useState(3);
    const [rpe, setRpe] = useState(5);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

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

            if (error) throw error; // Will warn in demo mode

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
            // In demo mode or error, still show confetti for UX testing
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
            <header className="bg-surface-light dark:bg-surface-dark border-b-4 border-primary p-4 shadow-lg flex justify-between items-center sticky top-0 z-50">
                <div>
                    <span className="text-xs uppercase text-gray-500 font-bold block">Hola,</span>
                    <h1 className="font-display text-2xl md:text-3xl leading-none">{athlete.name}</h1>
                </div>
                <button onClick={onLogout} className="text-xs font-bold uppercase border border-gray-500 px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800">
                    Salir
                </button>
            </header>

            <main className="flex-grow max-w-lg mx-auto w-full p-4 space-y-6">

                {/* Visual RMs Card */}
                <div className="bg-gray-800 dark:bg-chalkboard border-4 border-gray-700 dark:border-gray-900 p-4 shadow-2xl rounded relative overflow-hidden">
                    <div className="absolute inset-0 bg-noise opacity-20 pointer-events-none"></div>
                    <h2 className="font-display text-2xl text-center text-gray-400 mb-4 relative z-10">MIS PRs</h2>
                    <div className="grid grid-cols-2 gap-4 relative z-10">
                        <div className="text-center border-r border-gray-600/50">
                            <span className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1">SNATCH</span>
                            <span className="font-chalk text-4xl text-white chalk-text rotate-1 block">{athlete.snatch_rm} <span className="text-base text-gray-500">KG</span></span>
                        </div>
                        <div className="text-center">
                            <span className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1">CLEAN</span>
                            <span className="font-chalk text-4xl text-white chalk-text -rotate-1 block">{athlete.clean_rm} <span className="text-base text-gray-500">KG</span></span>
                        </div>
                    </div>
                </div>

                {/* Daily Check-in */}
                <div className="bg-surface-light dark:bg-surface-dark border-2 border-gray-200 dark:border-gray-800 p-6 rounded shadow-lg">
                    <h3 className="font-display text-2xl border-b border-primary/20 pb-2 mb-6">DAILY CHECK-IN</h3>

                    {/* Energy Selector */}
                    <div className="mb-6">
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-3">Energía</label>
                        <div className="flex justify-between text-2xl">
                            {[1, 2, 3, 4, 5].map(lvl => (
                                <button
                                    key={lvl}
                                    onClick={() => setEnergy(lvl)}
                                    className={`w-12 h-14 flex items-center justify-center rounded transition-all transform ${energy === lvl ? 'scale-125 bg-primary/20 border-b-2 border-primary' : 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0'}`}
                                >
                                    <span className="text-2xl">{['💀', '😫', '😐', '🙂', '⚡'][lvl - 1]}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* RPE Slider */}
                    <div className="mb-6">
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-3">RPE (Esfuerzo): <span className="text-primary text-lg">{rpe}</span></label>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            value={rpe}
                            onChange={(e) => setRpe(Number(e.target.value))}
                            className="w-full accent-primary h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                        />
                        <div className="flex justify-between text-[10px] uppercase text-gray-400 font-bold mt-1">
                            <span>Easy</span>
                            <span>Max Effort</span>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="mb-6">
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Notas del WOD</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-gray-700 p-3 rounded text-sm focus:border-primary focus:outline-none min-h-[100px]"
                            placeholder="Cómo te sentiste hoy?..."
                        />
                    </div>

                    <button
                        onClick={handleCheckIn}
                        disabled={saving}
                        className="w-full bg-primary hover:bg-red-700 text-white font-display text-xl py-4 rounded shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
                    >
                        {saving ? 'Guardando...' : <>
                            <span className="material-icons">check_circle</span> REGISTRAR WOD
                        </>}
                    </button>
                </div>
            </main>
        </div>
    )
}
