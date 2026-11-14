import { useNavigate } from 'react-router-dom';
import { markAccountChosen } from '../sim/account';
import { ASTRONAUTS } from '../sim/crew';
import { useSim } from '../sim/instance';

const TINTS = ['#B98BC4', '#D9B6E3', '#C9A5F5', '#E7C9EE'];

export default function AccountPicker() {
  const e = useSim();
  const nav = useNavigate();
  return (
    <section className="picker">
      <h1 className="hero">Who’s measuring?</h1>
      <div className="accounts">
        {ASTRONAUTS.map((a, i) => (
          <button key={a.id} className="account" onClick={() => { e.setViewer(a.id); markAccountChosen(); nav('/home'); }}>
            <span className="avatar" style={{ background: TINTS[i % TINTS.length] }} aria-hidden="true">{a.name.split(' ').map((w) => w[0]).join('')}</span>
            <span className="acc-name">{a.name}</span>
            <span className="acc-role">{a.role}</span>
          </button>
        ))}
      </div>
      <p className="fine">Simulation · fictional crew</p>
    </section>
  );
}
