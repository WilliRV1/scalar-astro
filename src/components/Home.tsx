
import logo from '../assets/logo-piperubio.png';

interface HomeProps {
    onNavigate: (view: 'coach_login' | 'athlete_login') => void;
}

export default function Home({ onNavigate }: HomeProps) {
    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center p-4">
            <div className="mb-12 text-center">
                <div className="h-24 w-24 mx-auto mb-4 rounded-full border-4 border-primary bg-black flex items-center justify-center overflow-hidden">
                    <img alt="Logo" className="w-full h-full object-cover opacity-90" src={logo} />
                </div>
                <h1 className="font-display text-5xl md:text-7xl tracking-wider leading-none text-black dark:text-white mb-2">
                    COACH <span className="text-primary">PIPERUBIO</span>
                </h1>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500 font-bold">
                    Athlete Management System
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                <button
                    onClick={() => onNavigate('coach_login')}
                    className="group relative h-48 md:h-64 bg-surface-light dark:bg-surface-dark border-2 border-gray-300 dark:border-gray-800 hover:border-primary transition-all duration-300 rounded flex flex-col items-center justify-center overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-primary/20"
                >
                    <div className="absolute inset-0 bg-noise opacity-10 pointer-events-none"></div>
                    <img src={logo} alt="Coach Logo" className="w-24 h-24 object-contain mb-4 transform group-hover:scale-110 duration-300 opacity-60 group-hover:opacity-100 grayscale group-hover:grayscale-0 transition-all" />
                    <span className="font-display text-3xl md:text-4xl text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors z-10">
                        SOY COACH
                    </span>
                </button>

                <button
                    onClick={() => onNavigate('athlete_login')}
                    className="group relative h-48 md:h-64 bg-surface-light dark:bg-surface-dark border-2 border-gray-300 dark:border-gray-800 hover:border-primary transition-all duration-300 rounded flex flex-col items-center justify-center overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-primary/20"
                >
                    <div className="absolute inset-0 bg-noise opacity-10 pointer-events-none"></div>
                    <span className="material-icons text-6xl text-gray-400 group-hover:text-primary transition-colors mb-4 transform group-hover:scale-110 duration-300">
                        fitness_center
                    </span>
                    <span className="font-display text-3xl md:text-4xl text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors z-10">
                        SOY ATLETA
                    </span>
                </button>
            </div>
        </div>
    );
}
