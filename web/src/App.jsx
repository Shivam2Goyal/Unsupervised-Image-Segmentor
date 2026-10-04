import { useEffect } from "react";
import { Routes, Route, NavLink, Link, useLocation } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Docs from "./pages/Docs.jsx";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="Pixel Sorter home">
          <span className="brand-mark" aria-hidden="true" />
          PIXEL SORTER
        </Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>SEGMENT</NavLink>
          <NavLink to="/docs">HOW IT WORKS</NavLink>
          <a href="https://github.com/Shivam2Goyal/GMM-Segmentation" target="_blank" rel="noreferrer">
            GITHUB ↗
          </a>
        </nav>
      </header>
      <ScrollToTop />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <span>GMM + EM · runs 100% in your browser · images never leave your device</span>
        <Link to="/docs">How it works →</Link>
      </footer>
    </>
  );
}
