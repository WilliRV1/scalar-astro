import { useState, useEffect } from 'react';
import CoachDashboard from './components/CoachDashboard';
import Home from './components/Home';
import AthleteLogin from './components/AthleteLogin';
import AthletePersonalView from './components/AthletePersonalView';

type ViewState = 'home' | 'coach_login' | 'coach_dashboard' | 'athlete_login' | 'athlete_dashboard';

function App() {
  const [view, setView] = useState<ViewState>('home');
  const [currentAthlete, setCurrentAthlete] = useState<any>(null);

  // Set Dark Mode by default for the industrial feel
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const handleCreateCoach = () => {
    const password = prompt("Ingrese Clave de Coach:");
    if (password === 'admin123') {
      setView('coach_dashboard');
    } else {
      alert("Clave incorrecta");
    }
  };

  const handleAthleteLoginSuccess = (athlete: any) => {
    setCurrentAthlete(athlete);
    setView('athlete_dashboard');
  };

  const renderView = () => {
    switch (view) {
      case 'home':
        return <Home onNavigate={(target) => {
          if (target === 'coach_login') handleCreateCoach();
          if (target === 'athlete_login') setView('athlete_login');
        }} />;

      case 'coach_dashboard':
        return (
          <div className="flex flex-col min-h-screen">
            <button
              onClick={() => setView('home')}
              className="fixed bottom-4 left-4 z-50 bg-black/50 text-white px-3 py-1 rounded-full text-xs hover:bg-black"
            >
              Exit to Home
            </button>
            <CoachDashboard />
          </div>
        );

      case 'athlete_login':
        return <AthleteLogin
          onLoginSuccess={handleAthleteLoginSuccess}
          onBack={() => setView('home')}
        />;

      case 'athlete_dashboard':
        return <AthletePersonalView
          athlete={currentAthlete}
          onLogout={() => {
            setCurrentAthlete(null);
            setView('home');
          }}
        />;

      default:
        return <div>View Not Found</div>;
    }
  };

  return (
    <div className="font-body text-gray-900 dark:text-gray-100 min-h-screen bg-background-light dark:bg-background-dark">
      {renderView()}
    </div>
  );
}

export default App;
