import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';

// Column mapping from Excel headers to DB fields
const COLUMN_MAP: Record<string, string> = {
    'clientes': 'name',
    'cliente': 'name',
    'nombre': 'name',
    'name': 'name',
    'fecha de corte': 'cut_day',
    'fecha_de_corte': 'cut_day',
    'corte': 'cut_day',
    'como llego': 'referral_source',
    'como llegó': 'referral_source',
    'referido': 'referral_source',
    'referral': 'referral_source',
    'back squat': 'back_squat',
    'backsquat': 'back_squat',
    'bench press': 'bench_press',
    'benchpress': 'bench_press',
    'bench': 'bench_press',
    'deadlift': 'deadlift',
    'peso muerto': 'deadlift',
    'shoulder press': 'shoulder_press',
    'shoulder p': 'shoulder_press',
    'press hombro': 'shoulder_press',
    'front squat': 'front_squat',
    'frontsquat': 'front_squat',
    'clean': 'clean_rm',
    'clean rm': 'clean_rm',
    'push press': 'push_press',
    'pushpress': 'push_press',
    'karen': 'karen',
    '100 burpees': 'burpees_100',
    'burpees': 'burpees_100',
    'burpees_100': 'burpees_100',
};

interface ExcelImportProps {
    onImport: (athletes: any[]) => void;
    onClose: () => void;
}

export default function ExcelImport({ onImport, onClose }: ExcelImportProps) {
    const [parsedData, setParsedData] = useState<any[] | null>(null);
    const [mappedColumns, setMappedColumns] = useState<Record<string, string>>({});
    const [rawHeaders, setRawHeaders] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const processFile = (file: File) => {
        setError('');
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                if (json.length < 2) {
                    setError('El archivo no contiene datos suficientes.');
                    return;
                }

                const headers = (json[0] as string[]).map(h => String(h || '').trim());
                setRawHeaders(headers);

                // Auto-map columns
                const autoMap: Record<string, string> = {};
                headers.forEach((h) => {
                    const normalized = h.toLowerCase().trim();
                    if (COLUMN_MAP[normalized]) {
                        autoMap[h] = COLUMN_MAP[normalized];
                    }
                });
                setMappedColumns(autoMap);

                // Parse rows
                const rows = json.slice(1).filter(row => row.some(cell => cell != null && cell !== ''));
                const athletes = rows.map(row => {
                    const athlete: any = {};
                    headers.forEach((header, i) => {
                        const dbField = autoMap[header];
                        if (dbField && row[i] != null) {
                            athlete[dbField] = String(row[i]).trim();
                        }
                    });
                    return athlete;
                }).filter(a => a.name);

                setParsedData(athletes);
            } catch (err) {
                console.error(err);
                setError('Error al leer el archivo. Asegúrate de que sea un .xlsx válido.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const DB_FIELDS = [
        { value: '', label: '-- Ignorar --' },
        { value: 'name', label: 'Nombre' },
        { value: 'cut_day', label: 'Fecha de Corte' },
        { value: 'referral_source', label: 'Como Llegó' },
        { value: 'back_squat', label: 'Back Squat' },
        { value: 'bench_press', label: 'Bench Press' },
        { value: 'deadlift', label: 'Deadlift' },
        { value: 'shoulder_press', label: 'Shoulder Press' },
        { value: 'front_squat', label: 'Front Squat' },
        { value: 'clean_rm', label: 'Clean' },
        { value: 'push_press', label: 'Push Press' },
        { value: 'karen', label: 'Karen' },
        { value: 'burpees_100', label: '100 Burpees' },
    ];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 40, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="bg-surface-dark border border-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                                <span className="material-icons text-emerald-400">upload_file</span>
                            </div>
                            <div>
                                <h2 className="font-display text-2xl text-white tracking-wide">IMPORTAR EXCEL</h2>
                                <p className="text-xs text-gray-500">Sube un archivo .xlsx con los datos de tus atletas</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2">
                            <span className="material-icons">close</span>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {!parsedData ? (
                            <>
                                {/* Drop Zone */}
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                    onClick={() => fileRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${dragOver
                                        ? 'border-emerald-500 bg-emerald-500/10'
                                        : 'border-gray-700 hover:border-gray-500 hover:bg-white/5'
                                        }`}
                                >
                                    <span className="material-icons text-5xl text-gray-600 mb-4 block">cloud_upload</span>
                                    <p className="text-gray-300 font-bold mb-1">Arrastra tu archivo aquí</p>
                                    <p className="text-gray-500 text-sm">o haz click para seleccionar</p>
                                    <p className="text-gray-600 text-xs mt-3">.xlsx, .xls</p>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept=".xlsx,.xls"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </div>

                                {error && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
                                        <span className="material-icons text-red-400">error</span>
                                        <p className="text-red-300 text-sm">{error}</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {/* Column Mapping */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">
                                        Mapeo de Columnas
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {rawHeaders.map(header => (
                                            <div key={header} className="bg-black/40 rounded-lg p-3 border border-gray-800">
                                                <p className="text-xs text-gray-500 mb-1 truncate" title={header}>Excel: <span className="text-gray-300">{header}</span></p>
                                                <select
                                                    value={mappedColumns[header] || ''}
                                                    onChange={(e) => setMappedColumns({ ...mappedColumns, [header]: e.target.value })}
                                                    className="w-full bg-surface-dark border border-gray-700 text-white text-sm rounded p-2 focus:border-emerald-500 focus:outline-none"
                                                >
                                                    {DB_FIELDS.map(f => (
                                                        <option key={f.value} value={f.value}>{f.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Preview */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                                        <span className="material-icons text-sm text-emerald-400">preview</span>
                                        Preview ({parsedData.length} atletas)
                                    </h3>
                                    <div className="overflow-x-auto rounded-lg border border-gray-800">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-black/60">
                                                    <th className="text-left p-3 text-gray-400 font-bold text-xs uppercase">#</th>
                                                    <th className="text-left p-3 text-gray-400 font-bold text-xs uppercase">Nombre</th>
                                                    <th className="text-left p-3 text-gray-400 font-bold text-xs uppercase">Corte</th>
                                                    <th className="text-left p-3 text-gray-400 font-bold text-xs uppercase">Referido</th>
                                                    <th className="text-left p-3 text-gray-400 font-bold text-xs uppercase">Back Sq.</th>
                                                    <th className="text-left p-3 text-gray-400 font-bold text-xs uppercase">Bench</th>
                                                    <th className="text-left p-3 text-gray-400 font-bold text-xs uppercase">Dead.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {parsedData.slice(0, 8).map((a, i) => (
                                                    <tr key={i} className="border-t border-gray-800/50 hover:bg-white/5">
                                                        <td className="p-3 text-gray-600">{i + 1}</td>
                                                        <td className="p-3 text-white font-bold">{a.name || '—'}</td>
                                                        <td className="p-3 text-gray-300">{a.cut_day || '—'}</td>
                                                        <td className="p-3 text-gray-300">{a.referral_source || '—'}</td>
                                                        <td className="p-3 text-gray-300">{a.back_squat || '—'}</td>
                                                        <td className="p-3 text-gray-300">{a.bench_press || '—'}</td>
                                                        <td className="p-3 text-gray-300">{a.deadlift || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {parsedData.length > 8 && (
                                            <p className="text-center text-gray-600 text-xs py-2">
                                                ... y {parsedData.length - 8} más
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    {parsedData && (
                        <div className="p-6 border-t border-gray-800 flex justify-between items-center">
                            <button
                                onClick={() => { setParsedData(null); setRawHeaders([]); setMappedColumns({}); }}
                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
                            >
                                <span className="material-icons text-sm">arrow_back</span>
                                Subir otro archivo
                            </button>
                            <button
                                onClick={() => onImport(parsedData)}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-lg font-bold uppercase tracking-wide transition-all shadow-lg shadow-emerald-900/30 hover:shadow-emerald-800/40"
                            >
                                <span className="material-icons text-sm">check_circle</span>
                                Importar {parsedData.length} Atletas
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
