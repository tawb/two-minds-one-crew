import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Shell from './components/Shell';
import About from './pages/About';
import AccountPicker from './pages/AccountPicker';
import Astronaut from './pages/Astronaut';
import Home from './pages/Home';
import MentalCheck from './pages/MentalCheck';
import MissionControl from './pages/MissionControl';
import Overview from './pages/Overview';
import Part from './pages/Part';
import Vitals from './pages/Vitals';
import { accountChosen } from './sim/account';
import { useSim } from './sim/instance';


/** Everything except the account picker needs an account chosen in this session. */
const guard = (el: ReactElement) => (accountChosen() ? el : <Navigate to="/" replace />);

export default function App() {
  const e = useSim();
  if (!e.S.ready) return <p className="loading">Starting simulation…</p>;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<AccountPicker />} />
        <Route path="/home" element={guard(<Home />)} />
        <Route path="/vitals" element={guard(<Vitals />)} />
        <Route path="/compare" element={<Navigate to="/mission-control?tab=compare" replace />} />
        <Route path="/response-check" element={guard(<MentalCheck userId={e.S.viewerId} />)} />
        <Route path="/part/:region" element={guard(<Part />)} />
        <Route path="/crew" element={guard(<Overview />)} />
        <Route path="/astronaut/:id" element={guard(<Astronaut />)} />
        <Route path="/mission-control" element={guard(<MissionControl />)} />
        <Route path="/coverage" element={<Navigate to="/about?tab=coverage" replace />} />
        <Route path="/validation" element={<Navigate to="/about?tab=validation" replace />} />
        <Route path="/sources" element={<Navigate to="/about?tab=sources" replace />} />
        <Route path="/share" element={<Navigate to="/home" replace />} />
        <Route path="/sleep" element={<Navigate to="/vitals?tab=sleep" replace />} />
        <Route path="/glucose" element={<Navigate to="/vitals?tab=glucose" replace />} />
        <Route path="/manual" element={<Navigate to="/vitals" replace />} />
        <Route path="/concepts" element={<Navigate to="/vitals" replace />} />
        <Route path="/history" element={<Navigate to="/vitals?tab=history" replace />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
