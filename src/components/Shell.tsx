import { installCvBridge } from '../readings/cvBridge';
import { buildNights, preferredNights } from '../readings/sleep';
import { seriesOf } from '../sim/selectors';
import { ReplayBanner } from './ReplayControls';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { astro } from '../sim/crew';
import { fmtDT } from '../sim/fmt';
import { markTourSeen, tourSeen } from '../sim/account';
import { useSim } from '../sim/instance';
import DemoPanel from './DemoPanel';
import { HelpButton, linkLabel } from './panels';
import { Icon } from './icons';
import Sparkles, { Star } from './Sparkles';
import Tour from './Tour';
import { Drawer } from './ui';

const TABS: { to: string; label: string; match: (p: string) => boolean }[] = [
  { to: '/home', label: 'Home', match: (p) => p === '/home' || p.startsWith('/part') },
  { to: '/vitals', label: 'Vitals', match: (p) => p === '/vitals' },
  { to: '/response-check', label: 'Mental check', match: (p) => p === '/response-check' },
  { to: '/crew', label: 'Crew', match: (p) => p === '/crew' || p.startsWith('/astronaut') },
  { to: '/mission-control', label: 'Earth', match: (p) => p === '/mission-control' },
];

export default function Shell({ children }: { children: ReactNode }) {
  const e = useSim();
  const S = e.S;
  const loc = useLocation();
  const [panel, setPanel] = useState<'demo' | null>(null);
  const [menu, setMenu] = useState(false);
  const [tour, setTour] = useState(() => !tourSeen());
  const wrap = useRef<HTMLDivElement>(null);
  const l = linkLabel(e);
  const me = astro(S.viewerId);
  const onPicker = loc.pathname === '/';
  const go = () => setMenu(false);
  const initials = me ? me.name.split(' ').map((w) => w[0]).join('') : '';

  // Close the menu on an outside click or Escape (and when the page changes).
  useEffect(() => {
    if (!menu) return;
    const down = (ev: MouseEvent | TouchEvent) => { if (wrap.current && !wrap.current.contains(ev.target as Node)) setMenu(false); };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setMenu(false); wrap.current?.querySelector<HTMLElement>('.avatar-btn')?.focus(); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('touchstart', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down); document.removeEventListener('keydown', key); };
  }, [menu]);
  useEffect(() => setMenu(false), [loc.pathname]);

  // Record each camera response check as a reading, with last night's sleep beside it (the check itself is untouched).
  useEffect(() => installCvBridge(() => {
    const id = e.S.viewerId;
    const nights = preferredNights(buildNights(seriesOf(e.S.series, id, 'sleep').filter((o) => !e.S.superseded.has(o.id)), [])).nights;
    return { subjectId: id, sleepHours: nights.length ? nights[nights.length - 1].hours : null };
  }), [e]);

  return (
    <div className="shell">
      <Sparkles />
      <header className="top">
        <Link to={onPicker ? '/' : '/home'} className="brand"><Star size={18} className="logo" />AstroVitals</Link>
        {!onPicker ? (
          <nav className="tabsnav" aria-label="Main">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} className={t.match(loc.pathname) ? 'tabn active' : 'tabn'} aria-current={t.match(loc.pathname) ? 'page' : undefined}>{t.label}</NavLink>
            ))}
          </nav>
        ) : <span />}
        {!onPicker ? (
          <div className="top-right">
            <HelpButton aid={S.viewerId} label="Help" ariaLabel="Request onboard help" onHowItWorks={() => setTour(true)} />
            <div className="acct-wrap" ref={wrap}>
              <button className="avatar-btn" aria-haspopup="menu" aria-expanded={menu} aria-label={`${me?.name ?? 'Account'} menu`} onClick={() => setMenu((v) => !v)}>{initials}</button>
              {menu && me && (
                <nav className="menu" role="menu" aria-label="Account and more">
                  <p className="menu-who"><b>{me.name}</b><span>{me.role}</span></p>
                  <div className="menu-list">
                    <Link role="menuitem" to="/" onClick={go}>Switch account</Link>
                    <Link role="menuitem" to="/about" onClick={go}>About</Link>
                    <button role="menuitem" onClick={() => { go(); setPanel('demo'); }}>Demo controls</button>
                  </div>
                  <div className="menu-bottom">
                    <div className="menu-foot">
                      <span className={`link ${l.cls}`}>{l.icon} {l.word}</span>
                      <span>{fmtDT(S.now)} UTC · x{S.speed}</span>
                    </div>
                  </div>
                </nav>
              )}
            </div>
          </div>
        ) : <span />}
      </header>
      {S.storageError && <p className="banner error storage-banner" role="alert"><Icon n="warn" /> {S.storageError}</p>}
      <ReplayBanner />
      <main>{children}</main>
      <footer className="foot"><span className="dotmark" aria-hidden="true" />Simulated data · not medical advice</footer>
      {tour && <Tour onClose={() => { markTourSeen(); setTour(false); }} />}
      {panel === 'demo' && <Drawer title="Demo controls" onClose={() => setPanel(null)}><DemoPanel /></Drawer>}
    </div>
  );
}
