# M393C · Edge–triangle phase atlas

A static, English-language atlas of entropy-maximizing graphons at fixed edge and triangle densities. The website separates rigorous local results, numerical candidates, and open questions. Literature was checked through 10 November 2026.

Open `index.html` or serve this directory with any static web server. No build step or installation is required. Mathematical notation is typeset with [KaTeX](https://katex.org/docs/browser.html), loaded from its pinned jsDelivr distribution with integrity checks; an internet connection is needed for the math renderer and fonts.

- `index.html`: page structure and scientific conventions.
- `app.js`: exact feasible boundaries, scallop close-up, interactive layers, model diagrams, and proof ledger.
- `data.js`: model descriptions, theorem scope, and primary-source references.
- `style.css`: responsive editorial layout, inspired by the Canva template linked in the footer.

The page uses half-Shannon entropy throughout: `h(p) = −½[p log p + (1−p) log(1−p)]`. Graphon diagrams have their origin at the bottom left. Model labels and local-existence markers do not supply numerical phase boundaries: widths described only as “sufficiently close” in the literature remain unspecified here.

The numerical slice at `e = 0.735` preserves the six transition brackets reported in KRRS (2017); its outer endpoints use the exact feasible-boundary and Erdős–Rényi formulas. Candidate phases should not be promoted to globally proved optima without a theorem with matching hypotheses.

No personal lecture scans or lecture-note module are included in this published site.
