import Link from "next/link";
import "./home.css";

const F = "/figma";

const threads = [
  { left: 219, top: 119, w: 259.999, h: 130.027, rot: 26.57, len: 290.7, img: "thread-1" },
  { left: 479, top: 178.98, w: 260.038, h: 70.018, rot: -15.07, len: 269.3, img: "thread-2" },
  { left: 339.08, top: 249, w: 139.916, h: 130.018, rot: 137.1, len: 191, img: "thread-3" },
  { left: 479, top: 249, w: 140.007, h: 140.007, rot: 45, len: 198, img: "thread-4" },
  { left: 218.87, top: 119.01, w: 120.131, h: 259.987, rot: -114.8, len: 286.4, img: "thread-5" },
  { left: 619, top: 178.96, w: 119.998, h: 210.038, rot: -60.26, len: 241.9, img: "thread-6" },
];

const nodes = [
  { name: "Elena Rostova", sub: "Principal, Vertex Labs", avatar: "avatar-elena", left: 119, top: 89 },
  { name: "Marcus Vance", sub: "Me (You)", avatar: "avatar-marcus", left: 409, top: 219, me: true },
  { name: "Dr. Aris Thorne", sub: "Director, BioSynthesis", avatar: "avatar-aris", left: 639, top: 149 },
  { name: "Sana Kothari", sub: "Partner, Bloom VC", avatar: "avatar-sana", left: 239, top: 349 },
  { name: "Devon Cole", sub: "Lead, Neural Systems", avatar: "avatar-devon", left: 519, top: 359 },
];

const steps = [
  {
    n: "01",
    icon: "file-search",
    title: "Consolidate Public Context",
    text: "Our cartographer agent scans public academic papers, patents, directories, and web mentions. No scraping of private message vaults or locked profiles.",
  },
  {
    n: "02",
    icon: "share-2",
    title: "Synthesize Relationship Paths",
    text: "Observe how nodes overlap. Learn who was in the same cohort, co-authored reports, or shared investment rounds, cleanly laid out in visual threads.",
  },
  {
    n: "03",
    icon: "message-circle",
    title: "Spark Gracious Conversations",
    text: "Receive smart prompt recommendations that focus on warm, shared interests, transforming cold outreaches into meaningful mutual discovery.",
  },
];

const path = [
  { letter: "A", name: "Sana Kothari", sub: "Mutual connection, backed Devon Cole" },
  { letter: "B", name: "Devon Cole", sub: "Co-authored panel with Target" },
  { letter: "C", name: "Elena Rostova", sub: "Target Node (Principal, Vertex)" },
];

const footerCols = [
  { title: "Platform", links: ["The Cartographer", "Warm Prompts", "Referral Pathing", "Pricing Plans"] },
  { title: "Ethics & Trust", links: ["Data Opt-Out", "Manifesto Code", "Developer API", "Terms of Consent"] },
  { title: "Corporate", links: ["About Us", "Our Sourcing", "Cartography Lab", "Contact"] },
];

function Check({ color, children }: { color: "amber" | "cyan"; children: React.ReactNode }) {
  return (
    <div className="check-row">
      <img src={`${F}/check-${color}.svg`} alt="" width={16} height={16} />
      <p>{children}</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="home">
      {/* Navbar */}
      <header className="navbar">
        <Link href="/" className="logo">
          <img src={`${F}/globe.svg`} alt="" />
          <span>Arachne</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <a href="#preview">Connection Map</a>
          <a href="#how">Sourcing Code</a>
          <a href="#trust">Trust &amp; Agency</a>
          <a href="#cta">Pricing</a>
        </nav>
        <div className="nav-actions">
          <Link href="/login" className="nav-login">
            Log In
          </Link>
          <Link href="/login" className="btn btn-primary">
            Map Your Network
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <img src={`${F}/shield-alert.svg`} alt="" width={12} height={12} />
            <span>Human-Centered Mapping</span>
          </div>
          <h1>
            A quiet map for your raw <span className="accent">human connections</span>
          </h1>
          <p className="hero-sub">
            Arachne synthesizes publicly available web directories to reconstruct your professional constellation. No
            surveillance, no invasion. Just thoughtful prompts, warm referrals, and total context ownership.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/login" className="btn btn-primary" style={{ width: 194 }}>
            <img src={`${F}/compass.svg`} alt="" width={16} height={16} />
            Generate your web
          </Link>
        </div>
        <div className="hero-stats">
          <p>Build your web.</p>
          <p>Life is dynamic. Your network should be too.</p>
        </div>
      </section>

      {/* Product preview */}
      <section className="product-preview" id="preview">
        <div className="preview-container">
          <div className="preview-header">
            <div className="header-left">
              <img src={`${F}/window-dots.svg`} alt="" width={42} height={10} />
              <span>Arachne Cartographer v1.4 // private_sandbox_mode</span>
            </div>
            <div className="header-right">
              <img src={`${F}/status-circle.svg`} alt="" width={10} height={10} />
              <span>Sourcing from Public APIs Only</span>
            </div>
          </div>
          <div className="canvas">
            <div className="grid-v" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="grid-v-cell" />
              ))}
            </div>
            <div className="grid-h" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="grid-h-line" />
              ))}
            </div>
            <img className="ring ring-outer" src={`${F}/ring-outer.svg`} alt="" />
            <img className="ring ring-inner" src={`${F}/ring-inner.svg`} alt="" />
            {threads.map((t) => (
              <div key={t.img} className="thread-box" style={{ left: t.left, top: t.top, width: t.w, height: t.h }}>
                <div className="thread" style={{ width: t.len, transform: `rotate(${t.rot}deg)` }}>
                  <img src={`${F}/${t.img}.svg`} alt="" />
                </div>
              </div>
            ))}
            {nodes.map((n) => (
              <div key={n.name} className={`pill${n.me ? " pill-me" : ""}`} style={{ left: n.left, top: n.top }}>
                <img className="pill-avatar" src={`${F}/${n.avatar}.png`} alt="" />
                <div className="pill-info">
                  <p className="pill-name">{n.name}</p>
                  <p className="pill-sub">{n.sub}</p>
                </div>
              </div>
            ))}
            <div className="tooltip">
              <div className="tooltip-title">
                <img src={`${F}/sparkles.svg`} alt="" width={14} height={14} />
                <span>Thoughtful Prompt</span>
              </div>
              <p>
                Ask Elena about her recent talk on &quot;Consensual AI&quot; at Synthesis. She co-authored it with your
                contact, Devon.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="workflow" id="how">
        <div className="section-head">
          <p className="eyebrow eyebrow-cyan">How Arachne Connects</p>
          <h2 className="workflow-title">Unveil relational paths seamlessly</h2>
        </div>
        <div className="steps-row">
          {steps.map((s) => (
            <article key={s.n} className="step-card">
              <div className="step-header">
                <div className="step-icon-bg">
                  <img src={`${F}/${s.icon}.svg`} alt="" width={20} height={20} />
                </div>
                <span className="step-num">{s.n}</span>
              </div>
              <div className="step-content">
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Feature one */}
      <section className="feature feature-prompts" id="trust">
        <div className="feature-copy">
          <div className="feature-text">
            <p className="eyebrow eyebrow-amber">FEATURE PREVIEW ONE</p>
            <h2>Prompt contexts, not pre-scripted pitches</h2>
            <p className="feature-body">
              Most outreach fails because it relies on generic templates. Arachne maps natural cross-sections in your
              networks — like shared publications, past co-working chapters, or mutual investments — and drafts
              personalized conversation triggers that respect the other party&apos;s time and actual history.
            </p>
          </div>
          <div className="checklist">
            <Check color="amber">100% natural, context-rich triggers</Check>
            <Check color="amber">Sourced solely from public professional histories</Check>
            <Check color="amber">Directly highlights verified third-party handshakes</Check>
          </div>
        </div>
        <div className="panel-wrap">
          <div className="panel">
            <div className="panel-top">
              <div className="panel-person">
                <img className="panel-avatar" src={`${F}/panel-sana.png`} alt="" />
                <div className="panel-person-info">
                  <p className="panel-name">Sana Kothari</p>
                  <p className="panel-role">Target Connection</p>
                </div>
              </div>
              <span className="match-badge">94% Match Context</span>
            </div>
            <div className="divider" />
            <div className="spark">
              <p className="spark-label">Proposed Opening Spark</p>
              <div className="spark-box">
                <p>
                  &quot;Hi Sana, I noticed your portfolio company Apex Systems co-published the recent report on
                  Decentralized Grid Stability with Devon Cole. I&apos;ve been tracing Devon&apos;s work on load
                  balancing — would love to trade brief notes on where your system models intersect.&quot;
                </p>
              </div>
            </div>
            <div className="panel-foot">
              <p>Click to edit &amp; export context</p>
              <button type="button" className="btn btn-raised">
                <img src={`${F}/copy.svg`} alt="" width={16} height={16} />
                Copy Prompt Draft
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature two */}
      <section className="feature feature-referrals">
        <div className="panel-wrap">
          <div className="panel">
            <div className="tree-header">
              <p>Verified Introduction Path</p>
              <p>2 Degrees of Separation</p>
            </div>
            <div className="tree-list">
              {path.map((p) => (
                <div key={p.letter} className="tree-row">
                  <div className="tree-letter">{p.letter}</div>
                  <div className="tree-info">
                    <p className="tree-name">{p.name}</p>
                    <p className="tree-sub">{p.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="feature-copy">
          <div className="feature-text">
            <p className="eyebrow eyebrow-cyan">FEATURE PREVIEW TWO</p>
            <h2>Document mutual pathways honestly</h2>
            <p className="feature-body">
              Relationships don&apos;t live in isolated spreadsheets. Arachne visualizes verified paths so you can ask
              for referrals with high social context. No assumptions are made — each pathway link highlights exactly why
              those people know each other, giving you a safe and honest map for warm outreach.
            </p>
          </div>
          <div className="checklist">
            <Check color="cyan">Clearly shows historical evidence (co-authored, same investor)</Check>
            <Check color="cyan">Lets you map customized referral hierarchies manually</Check>
            <Check color="cyan">Keeps your warm introduction pipeline private to your eyes</Check>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta" id="cta">
        <img className="cta-bg" src={`${F}/final-cta.png`} alt="" />
        <div className="cta-overlay" />
        <div className="cta-content">
          <h2>Chart your true network</h2>
          <p>
            Construct a network that keeps up with everyday life. From changing careers to new interests, Arachne brings
            your network with you to keep you connected with the people who matter.
          </p>
          <div className="cta-actions">
            <Link href="/login" className="btn btn-primary" style={{ width: 170 }}>
              <img src={`${F}/compass.svg`} alt="" width={16} height={16} />
              Map My Web
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-columns">
            <div className="footer-brand">
              <div className="logo">
                <img src={`${F}/globe.svg`} alt="" />
                <span>Arachne</span>
              </div>
              <p>
                Intelligent relationship cartography built with strict user consent, open-source auditing, and total
                respect for human network agency.
              </p>
            </div>
            {footerCols.map((c) => (
              <div key={c.title} className="footer-col">
                <p className="footer-col-title">{c.title}</p>
                {c.links.map((l) => (
                  <p key={l} className="footer-link">
                    {l}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <div className="footer-bottom">
            <p>© 2026 Arachne Technologies Inc. Relational cartography systems patented.</p>
            <div className="footer-legal">
              <p>Privacy Statement</p>
              <p>Opt-Out Portal</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
