import { useEffect, useState } from 'react';
import { useRoute } from './hooks';
import { GROUPS, TOOLS } from './tools/registry';

function Home() {
  return (
    <>
      <header className="tool-header">
        <h1>Net Tools</h1>
        <p className="lede">Everyday network calculators. Everything runs in your browser, and nothing you type is sent anywhere.</p>
      </header>
      {GROUPS.map((g) => (
        <section key={g} className="home-group">
          <h2>{g}</h2>
          <div className="tool-grid">
            {TOOLS.filter((t) => t.group === g).map((t) => (
              <a key={t.path} className="tool-card" href={`#${t.path}`}>
                <strong>{t.title}</strong>
                <span>{t.summary}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function App() {
  const path = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const tool = TOOLS.find((t) => t.path === path);

  useEffect(() => {
    document.title = tool ? `${tool.title} · Net Tools` : 'Net Tools';
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [tool]);

  const Tool = tool?.component;

  return (
    <div className="app">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand-row">
          <a className="brand" href="#/">
            <span className="brand-mark" aria-hidden>
              N
            </span>
            Net Tools
          </a>
          <button type="button" className="menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="nav">
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
        <nav id="nav">
          {GROUPS.map((g) => (
            <div key={g} className="nav-group">
              <div className="nav-group-title">{g}</div>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <a key={t.path} href={`#${t.path}`} className={t.path === path ? 'active' : undefined} aria-current={t.path === path ? 'page' : undefined}>
                  {t.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="content">
        {Tool ? (
          <Tool key={path} />
        ) : (
          <Home />
        )}
      </main>
    </div>
  );
}
