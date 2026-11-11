'use strict';
const SOURCES=[
  {
    "id": "RS2015",
    "short": "Radin–Sadun 2015",
    "title": "Singularities in the entropy of asymptotically large simple graphs",
    "authors": "Charles Radin · Lorenzo Sadun",
    "year": "2015",
    "journal": "Journal of Statistical Physics 158, 853–865",
    "url": "https://arxiv.org/abs/1302.3531",
    "doi": "https://doi.org/10.1007/s10955-014-1151-3"
  },
  {
    "id": "KRRS2017",
    "short": "KRRS 2017",
    "title": "The phases of large networks with edge and triangle constraints",
    "authors": "Richard Kenyon · Charles Radin · Kui Ren · Lorenzo Sadun",
    "year": "2017",
    "journal": "Journal of Physics A 50, 435001",
    "url": "https://arxiv.org/abs/1701.04444",
    "doi": "https://doi.org/10.1088/1751-8121/aa8ce1"
  },
  {
    "id": "KRRS2018",
    "short": "KRRS 2018",
    "title": "Bipodal structure in oversaturated random graphs",
    "authors": "Richard Kenyon · Charles Radin · Kui Ren · Lorenzo Sadun",
    "year": "2018",
    "journal": "International Mathematics Research Notices 2018(4), 1009–1044",
    "url": "https://arxiv.org/abs/1509.05370",
    "doi": "https://doi.org/10.1093/imrn/rnw261"
  },
  {
    "id": "NRS2023",
    "short": "Neeman–Radin–Sadun 2023",
    "title": "Typical large graphs with given edge and triangle densities",
    "authors": "Joe Neeman · Charles Radin · Lorenzo Sadun",
    "year": "2023",
    "journal": "Probability Theory and Related Fields 186, 1167–1223",
    "url": "https://arxiv.org/abs/2110.14052",
    "doi": "https://doi.org/10.1007/s00440-023-01187-8"
  },
  {
    "id": "NRS2024",
    "short": "Neeman–Radin–Sadun 2024",
    "title": "Existence of a symmetric bipodal phase in the edge-triangle model",
    "authors": "Joe Neeman · Charles Radin · Lorenzo Sadun",
    "year": "2024",
    "journal": "Journal of Physics A 57, 095003",
    "url": "https://arxiv.org/abs/2211.10498",
    "doi": "https://doi.org/10.1088/1751-8121/ad259d"
  },
  {
    "id": "RS2025",
    "short": "Radin–Sadun 2025",
    "title": "Emergence in Graphs with near-extreme constraints",
    "authors": "Charles Radin · Lorenzo Sadun",
    "year": "2025",
    "journal": "arXiv:2411.14556v3 · 28 August 2025",
    "url": "https://arxiv.org/html/2411.14556v3"
  },
  {
    "id": "DS2025",
    "short": "DiCarlo–Sadun 2025",
    "title": "Tripodal structure in undersaturated random graphs",
    "authors": "William DiCarlo · Lorenzo Sadun",
    "year": "2025",
    "journal": "Online Journal of Analytic Combinatorics 20, Paper 4",
    "url": "https://arxiv.org/abs/2508.16797",
    "full": "https://combinatorialpress.com/article/ojac/vol20/tripodal-structure-in-undersaturated-random-graphs.pdf"
  },
  {
    "id": "R2008",
    "short": "Razborov 2008",
    "title": "On the Minimal Density of Triangles in Graphs",
    "authors": "Alexander Razborov",
    "year": "2008",
    "journal": "Combinatorics, Probability and Computing 17, 603–618",
    "url": "https://doi.org/10.1017/S0963548308009085"
  },
  {
    "id": "PR2017",
    "short": "Pikhurko–Razborov 2017",
    "title": "Asymptotic Structure of Graphs with the Minimum Number of Triangles",
    "authors": "Oleg Pikhurko · Alexander Razborov",
    "year": "2017",
    "journal": "Combinatorics, Probability and Computing 26, 138–160",
    "url": "https://arxiv.org/abs/1204.2846",
    "doi": "https://doi.org/10.1017/S0963548316000110"
  },
  {
    "id": "ARW2026",
    "short": "Alvarado–Ramon–Wang 2026",
    "title": "Constrained Multi-Relational Graphons with Maximum Entropy",
    "authors": "Juan Alvarado · Jan Ramon · Yuyi Wang",
    "year": "2026",
    "journal": "arXiv:2607.22383v1 · Preprint; additional hypotheses apply",
    "url": "https://arxiv.org/html/2607.22383v1"
  }
];
const PHASES=[
  {
    "id": "A2",
    "label": "A(2,0)",
    "name": "Symmetric bipodal",
    "status": "proved",
    "statusText": "Proved in specified regions",
    "range": "The segment \\(e=\\tfrac12\\), \\(0<t<\\tfrac18\\), and an open neighborhood of it.",
    "position": [
      0.5,
      0.063
    ],
    "matrix": "A",
    "n": 2,
    "matrixNote": "Two equal vertex classes, with fewer edges within classes than between them. This matrix shows the structure, not a numerical fit.",
    "formula": "\\[\\begin{aligned}\\sigma&=(e^3-t)^{1/3}\\\\a&=e-\\sigma,\\quad b=e+\\sigma\\\\S&=\\tfrac12 h(a)+\\tfrac12 h(b)\\end{aligned}\\]",
    "proved": "RS2015, Theorem 6.2, gives the unique optimizer along the full segment \\(e=\\tfrac12\\), \\(0\\le t\\le\\tfrac18\\). NRS2024 extends the result to an open neighborhood of the segment with \\(0<t<\\tfrac18\\). RS2025 also proves that, for every fixed \\(0<e<\\tfrac12\\) and sufficiently small positive t, the unique optimizer is A(2,0).",
    "limit": "These theorems do not give an explicit boundary for the entire A(2,0) phase. For fixed 0 < e < \\(\\frac{3-\\sqrt3}{6}\\), this model is not optimal sufficiently close to ER from below.",
    "refs": [
      "RS2015",
      "NRS2024",
      "RS2025"
    ]
  },
  {
    "id": "A",
    "label": "A(n,0)",
    "name": "Fully symmetric n-podal family",
    "status": "numeric",
    "statusText": "General interior: numerical evidence",
    "range": "Below ER, associated with the complete n-partite cusps.",
    "position": [
      0.72,
      0.36
    ],
    "matrix": "A",
    "n": 3,
    "selector": [
      3,
      10
    ],
    "matrixNote": "There are n equal vertex classes. Every diagonal block has value a; every off-diagonal block has value b. The family continues to arbitrarily large n.",
    "formula": "\\[\\begin{aligned}q&=\\left(\\frac{e^3-t}{n-1}\\right)^{1/3}\\\\a&=e-(n-1)q,\\quad b=e+q\\\\S&=\\frac{h(a)}n+\\frac{n-1}{n}h(b)\\end{aligned}\\]",
    "proved": "The complete n-partite Turán cusp has e = (n−1)/n and t = (n−1)(n−2)/n². These cusp locations are exact. Open regions with n = 2 have been proved; see A(2,0).",
    "limit": "In the literature checked here, the broad interior regions for n ≥ 3 and their full boundaries are still supported mainly by numerical experiments. The formulas give a feasible candidate only when 0 ≤ a,b ≤ 1; they do not by themselves prove maximum entropy.",
    "refs": [
      "KRRS2017",
      "R2008",
      "PR2017"
    ]
  },
  {
    "id": "B1",
    "label": "B(1,1)",
    "name": "Asymmetric bipodal",
    "status": "proved",
    "statusText": "Proved locally below ER",
    "range": "Each fixed \\(\\tfrac12<e<1\\), sufficiently close to \\(t=e^3\\) from below.",
    "position": [
      0.72,
      0.363
    ],
    "matrix": "B",
    "n": 1,
    "matrixNote": "One small class and one large class. The within-class probabilities a and p generally differ from the between-class probability d. Block widths are schematic.",
    "formula": "\\[g=\\begin{pmatrix}a&d\\\\d&p\\end{pmatrix}\\]<br>Block masses: \\(c\\) and \\(1-c\\).",
    "proved": "NRS2023, Theorem 1: for every fixed \\(\\tfrac12<e<1\\), sufficiently close to ER from below, the unique entropy-maximizing graphon is bipodal. Its parameters and entropy are analytic within the phase.",
    "limit": "“Sufficiently close” does not provide a uniform numerical width that can be plotted. This theorem does not establish the entire larger B(1,1) region, or all of its boundaries, in the 2017 diagram.",
    "refs": [
      "NRS2023",
      "KRRS2017"
    ]
  },
  {
    "id": "B",
    "label": "B(n,1)",
    "name": "n equivalent pods + one distinct pod",
    "status": "numeric",
    "statusText": "General family: numerical evidence",
    "range": "Multipodal regions below ER, interspersed with the A and C families.",
    "position": [
      0.82,
      0.53
    ],
    "matrix": "B",
    "n": 2,
    "selector": [
      2,
      10
    ],
    "matrixNote": "The first n classes are interchangeable, each with mass c/n. The remaining class has mass 1−c. The symbols a, b, d and p denote distinct probability classes.",
    "formula": "\\[g=\\begin{pmatrix}(a-b)I_n+bJ_n&d\\mathbf1_n\\\\d\\mathbf1_n^{\\mathsf T}&p\\end{pmatrix}\\]<br>The first \\(n\\) classes have mass \\(c/n\\); the special class has mass \\(1-c\\).",
    "proved": "KRRS2017 proves that certain transitions cannot be continuous. These are conditional restrictions on the type of transition, if it occurs. NRS2023 separately proves global optimality of B(1,1) in a local region.",
    "limit": "Theorems about transition types do not establish phase existence throughout the depicted regions or determine exact boundaries. The interior map for B(n,1), n ≥ 2, remains primarily numerical.",
    "refs": [
      "KRRS2017",
      "NRS2023"
    ]
  },
  {
    "id": "C",
    "label": "C(n,2)",
    "name": "n equivalent pods + a distinct pair",
    "status": "proved",
    "statusText": "Proved near every open scallop",
    "range": "For \\(\\frac n{n+1}<e<\\frac{n+1}{n+2}\\), sufficiently close above \\(t_{\\min}(e)\\).",
    "position": [
      0.59,
      0.14
    ],
    "matrix": "C",
    "n": 1,
    "selector": [
      1,
      10
    ],
    "matrixNote": "There are n+2 classes. The first n are interchangeable, as are the final two. There are generally five edge-probability classes, or four when n = 1.",
    "formula": "\\[\\frac{n}{n+1}<e<\\frac{n+1}{n+2}\\]<br>Total number of pods: \\(n+2\\).",
    "proved": "RS2025, Theorem 2 (detailed Theorem 17): for each fixed e strictly inside the stated interval, sufficiently close above its scallop, the unique optimizer has (n,2) symmetry and analytic parameters. Theorem 3 proves that these phases are distinct.",
    "limit": "This establishes infinitely many phases locally. It does not determine the full upper boundary of each C region or cover every vertical line directly above a cusp.",
    "refs": [
      "RS2025",
      "KRRS2017"
    ]
  },
  {
    "id": "F",
    "label": "F(1,1)",
    "name": "Bipodal candidate phase above ER",
    "status": "open",
    "statusText": "Local proofs; global phase open",
    "range": "\\(e^3<t<e^{3/2}\\).",
    "position": [
      0.53,
      0.27
    ],
    "matrix": "B",
    "n": 1,
    "matrixNote": "Two generally unequal vertex classes. This is a different branch from B(1,1) below ER; bipodality alone does not identify a single analytic phase.",
    "formula": "\\[e^3<t<e^{3/2}\\]",
    "proved": "KRRS2018, Theorem 1.1: for every fixed e ∈ (0,1), e ≠ ½, the unique optimizer is bipodal sufficiently close above ER. RS2025, Theorem 4: for every fixed e ∈ (0,1), the unique optimizer is bipodal sufficiently close below the upper boundary.",
    "limit": "It remains unproved that these neighborhoods connect into one F(1,1) phase covering the entire region above ER. The cited 2018 theorem explicitly excludes \\(e=\\tfrac12\\). The full upper region is therefore not marked as proved.",
    "refs": [
      "KRRS2018",
      "RS2025",
      "KRRS2017"
    ]
  },
  {
    "id": "ER",
    "label": "ER",
    "name": "Constant graphon with independent edges",
    "status": "proved",
    "statusText": "Exact result",
    "range": "\\(t=e^3\\), \\(0\\le e\\le1\\).",
    "position": [
      0.41,
      0.06892099999999998
    ],
    "matrix": "ER",
    "n": 1,
    "matrixNote": "One vertex type, with every pair joined with probability e. The constant graphon is the Erdős–Rényi limit.",
    "formula": "\\[\\begin{aligned}g(x,y)&\\equiv e\\\\S(g)&=h(e)\\end{aligned}\\]",
    "proved": "Jensen’s inequality gives S(g) ≤ h(∬g) = h(e). For 0 < e < 1, strict concavity of h makes equality possible only when \\(g\\equiv e\\) almost everywhere. Its triangle density is exactly e³.",
    "limit": "The optimizer on ER is known exactly, while the structures on its two sides can differ. RS2015 proves nondifferentiability of the constrained entropy across ER for 0 < e < 1.",
    "refs": [
      "RS2015"
    ]
  },
  {
    "id": "upper",
    "label": "Upper boundary",
    "name": "A clique block + isolated vertices",
    "status": "proved",
    "statusText": "Exact result",
    "range": "\\(t=e^{3/2}\\).",
    "position": [
      0.37,
      0.22506221362103412
    ],
    "matrix": "upper",
    "n": 2,
    "matrixNote": "A block of vertex mass \\(\\sqrt e\\) has edge probability 1 internally; the graphon is 0 everywhere else. The remaining vertices are isolated. Block widths are schematic.",
    "formula": "\\[\\begin{aligned}g&=\\mathbf1_{A\\times A}\\\\|A|&=\\sqrt e,\\qquad S(g)=0\\end{aligned}\\]",
    "proved": "RS2015, Theorem 6.1: on the upper boundary, the unique reduced optimizer is a clique block together with isolated vertices. RS2025 proves unique bipodal optimality in a sufficiently small neighborhood below this boundary.",
    "limit": "The boundary graphon takes only the values 0 and 1. This boundary matrix is not the exact optimizer at nearby interior points.",
    "refs": [
      "RS2015",
      "RS2025"
    ]
  },
  {
    "id": "lower",
    "label": "Lower boundary",
    "name": "Razborov scallops",
    "status": "proved",
    "statusText": "Exact feasible boundary",
    "range": "\\(t=t_{\\min}(e)\\). For \\(0\\le e\\le\\tfrac12\\), \\(t_{\\min}=0\\).",
    "position": [
      0.7,
      0.3
    ],
    "matrix": "lower",
    "n": 2,
    "selector": [
      1,
      10
    ],
    "matrixNote": "The entropy-maximizing representative on an open scallop has n equal classes and two equal final classes. Diagonal blocks are 0; all off-diagonal blocks are 1 except between the final pair, where the value is p.",
    "formula": "For \\(0\\le e\\le\\tfrac12\\):\\[t_{\\min}=0,\\qquad S=\\tfrac12h(2e).\\]For \\(n\\ge1\\) and \\(\\frac n{n+1}\\le e\\le\\frac{n+1}{n+2}\\):\\[c=\\frac{1+\\sqrt{1-\\frac{(n+2)e}{n+1}}}{n+2}\\]\\[\\begin{aligned}t_{\\min}={}&n(n+1)(n+2)c^3\\\\&-3n(n+1)c^2+3nec\\end{aligned}\\]\\[\\begin{aligned}r&=1-nc\\\\p&=\\frac{2(e+nc^2-1+r^2)}{r^2}\\\\S&=\\frac{r^2}{2}h(p)\\end{aligned}\\]Block masses: \\(c,\\ldots,c,r/2,r/2\\).",
    "proved": "On the flat boundary t = 0, 0 < e ≤ ½, the unique optimizer is balanced bipodal: 0 within classes and 2e between them, with entropy \\(\\tfrac12h(2e)\\). For the later scallops, Razborov determines the exact lower boundary and Pikhurko–Razborov describes the asymptotic triangle-minimizing structures. RS2025 uses the unique entropy-maximizing representative within this extremal family and proves the neighboring interior C(n,2) phases.",
    "limit": "Triangle-minimizing graphons need not all be equivalent. The extremal-structure theorem does not make the entire extremal family unique. At cusps, classes merge or the representation degenerates. The endpoints e = 0 and e = 1 are the empty and complete graphons, respectively.",
    "refs": [
      "R2008",
      "PR2017",
      "RS2025"
    ]
  },
  {
    "id": "Tsmall",
    "label": "Tripodal · O(e)",
    "name": "Tripodal candidate at low edge density",
    "status": "numeric",
    "statusText": "Bipodality ruled out; tripodality open",
    "range": "\\(0<e<e_0=\\frac{3-\\sqrt3}{6}\\approx0.2113\\), sufficiently close below ER.",
    "position": [
      0.1,
      0.0009999500000000003
    ],
    "matrix": "T",
    "n": 3,
    "matrixNote": "(2,1) symmetry: two equal classes and one distinct class. O(e) describes the scale of edge probabilities in this branch, not the number of classes.",
    "formula": "\\[\\begin{aligned}\\sigma&=(e^3-t)^{1/3}\\\\e_0&=\\frac{3-\\sqrt3}{6}\\end{aligned}\\]",
    "proved": "Together, NRS2024 Proposition 16 and Theorem 3 show that, for each fixed 0 < e < \\(e_0\\) and t sufficiently close below e³, a tripodal construction strictly outperforms every bipodal graphon. Thus the true optimizer cannot be bipodal.",
    "limit": "Ruling out bipodality does not prove that a globally optimal graphon has exactly three classes. The winning tripodal regions in DS2025 come from numerical comparisons; other asymmetric tripodal or higher-podal graphons are not excluded.",
    "refs": [
      "NRS2024",
      "DS2025"
    ]
  },
  {
    "id": "Tlarge",
    "label": "Tripodal · Θ(1)",
    "name": "A second tripodal branch at very low density",
    "status": "numeric",
    "statusText": "Numerical candidate branch",
    "range": "Numerically, \\(e\\lesssim0.0024\\), extremely close below ER.",
    "position": [
      0.0015,
      3.37496625e-09
    ],
    "matrix": "T",
    "n": 3,
    "matrixNote": "Again (2,1)-symmetric and tripodal, but with some edge probabilities of order Θ(1). Its asymptotics differ from those of the O(e) branch.",
    "formula": "DS2025 numerical observation:\\[0.9999\\,e^3<t<e^3\\]This is not a rigorous global phase boundary.",
    "proved": "This branch provides explicit constructions that can be compared with other candidates. The papers checked here do not prove its global optimality among all graphons.",
    "limit": "The classification in DS2025 §5 explicitly assumes that the winner is bipodal or (2,1)-symmetric tripodal. The values 0.0024 and 0.9999 are numerical observations, not theorem constants.",
    "refs": [
      "DS2025"
    ]
  }
];
const LEDGER=[
  {
    "region": "\\(t=e^3\\)",
    "sub": "ER curve",
    "model": "Unique optimizer \\(g\\equiv e\\)",
    "type": "proved",
    "note": "Jensen’s inequality and strict concavity of h for 0 < e < 1. The endpoints are immediate as well.",
    "refs": [
      "RS2015"
    ]
  },
  {
    "region": "\\(t=e^{3/2}\\)",
    "sub": "Upper boundary",
    "model": "Clique block + isolated vertices",
    "type": "proved",
    "note": "RS2015, Theorem 6.1. The clique has vertex mass \\(\\sqrt e\\) and the boundary entropy is 0.",
    "refs": [
      "RS2015"
    ]
  },
  {
    "region": "\\(t=t_{\\min}(e)\\)",
    "sub": "Lower boundary / scallops",
    "model": "Exact minimum triangle density; an entropy-maximizing block representative",
    "type": "proved",
    "note": "Distinguish the family of all triangle-minimizing graphons from its entropy-maximizing representative. The full extremal family need not be unique.",
    "refs": [
      "R2008",
      "PR2017",
      "RS2025"
    ]
  },
  {
    "region": "\\(e=\\tfrac12\\), \\(0\\le t\\le\\tfrac18\\)",
    "sub": "A(2,0)",
    "model": "Balanced bipodal; a = ½−σ, b = ½+σ",
    "type": "proved",
    "note": "RS2015, Theorem 6.2; σ = (⅛−t)¹ᐟ³.",
    "refs": [
      "RS2015"
    ]
  },
  {
    "region": "An open neighborhood of the \\(e=\\tfrac12\\) segment",
    "sub": "A(2,0)",
    "model": "Unique symmetric bipodal optimizer; analytic parameters",
    "type": "proved",
    "note": "NRS2024, Theorems 1/4. The segment is \\(0<t<\\tfrac18\\); no explicit uniform neighborhood width is given.",
    "refs": [
      "NRS2024"
    ]
  },
  {
    "region": "Fixed \\(0<e<\\tfrac12\\); t ↓ 0",
    "sub": "A(2,0)",
    "model": "Unique symmetric bipodal optimizer",
    "type": "proved",
    "note": "RS2025, Theorems 1/14: for each fixed e and sufficiently small positive t. This does not cover the entire depicted A phase.",
    "refs": [
      "RS2025"
    ]
  },
  {
    "region": "Fixed \\(\\tfrac12<e<1\\); t ↑ e³",
    "sub": "B(1,1) / approaching from below",
    "model": "Unique bipodal optimizer; analytic parameters",
    "type": "proved",
    "note": "NRS2023, Theorem 1: sufficiently close to ER, with no numerical width specified.",
    "refs": [
      "NRS2023"
    ]
  },
  {
    "region": "e ≠ ½; t ↓ e³",
    "sub": "F(1,1) / approaching from above",
    "model": "Unique bipodal optimizer; the small class mass tends to 0",
    "type": "proved",
    "note": "KRRS2018, Theorem 1.1: fixed e ∈ (0,1), e ≠ ½. The stated theorem explicitly excludes \\(e=\\tfrac12\\).",
    "refs": [
      "KRRS2018"
    ]
  },
  {
    "region": "Fixed 0 < e < 1; t ↑ e<sup>3/2</sup>",
    "sub": "Just inside the upper boundary",
    "model": "Unique bipodal optimizer; analytic parameters",
    "type": "proved",
    "note": "RS2025, Theorems 4/20. No quantified uniform neighborhood width is given.",
    "refs": [
      "RS2025"
    ]
  },
  {
    "region": "Just above each open scallop",
    "sub": "C(n,2), n ≥ 1",
    "model": "Unique (n+2)-podal optimizer with (n,2) symmetry",
    "type": "proved",
    "note": "Fix n/(n+1) < e < (n+1)/(n+2), then approach the lower boundary sufficiently closely. RS2025, Theorems 2/17 and 3/19, establishes infinitely many distinct phases locally.",
    "refs": [
      "RS2025"
    ]
  },
  {
    "region": "Fixed 0 < e < \\(e_0\\); t ↑ e³",
    "sub": "\\(e_0=\\frac{3-\\sqrt3}{6}\\)",
    "model": "All bipodal optimizers are ruled out",
    "type": "proved",
    "note": "NRS2024, Proposition 16 + Theorem 3. A tripodal construction beats every bipodal graphon; global tripodal optimality is not proved.",
    "refs": [
      "NRS2024"
    ]
  },
  {
    "region": "Small e, in a thin layer below ER",
    "sub": "O(e) and Θ(1) tripodal branches",
    "model": "(2,1)-symmetric tripodal candidates",
    "type": "numeric",
    "note": "DS2025 §4–5 assumes candidates are bipodal or symmetric tripodal. The branch change near e ≈ 0.0024 is not a proved boundary.",
    "refs": [
      "DS2025"
    ]
  },
  {
    "region": "Interior of A(n,0), n ≥ 3",
    "sub": "General fully symmetric phases",
    "model": "n equal classes",
    "type": "numeric",
    "note": "KRRS2017 numerical phase diagram. Exact cusp locations do not establish the entire surrounding A phase.",
    "refs": [
      "KRRS2017"
    ]
  },
  {
    "region": "Interior of B(n,1), n ≥ 2",
    "sub": "General asymmetric multipodal phases",
    "model": "n equivalent classes + one distinct class",
    "type": "numeric",
    "note": "Supported by the numerical portrait and the e = .735 slice. Discontinuous-transition theorems do not replace proofs of global optimality throughout a phase region.",
    "refs": [
      "KRRS2017"
    ]
  },
  {
    "region": "The entire region e³ < t < e<sup>3/2</sup>",
    "sub": "A single F(1,1) phase?",
    "model": "Bipodality everywhere, within one connected phase?",
    "type": "open",
    "note": "Local neighborhoods of both bounding curves have been proved. Connecting them and covering the entire interior remains open.",
    "refs": [
      "RS2025",
      "KRRS2017"
    ]
  },
  {
    "region": "\\(e_0\\) < e < ½, just below ER",
    "sub": "Is symmetric bipodality globally optimal?",
    "model": "Candidate A(2,0); full classification open",
    "type": "open",
    "note": "Explicitly left open in NRS2024. Being best among bipodal graphons does not imply being best among all graphons.",
    "refs": [
      "NRS2024"
    ]
  },
  {
    "region": "All interior (e,t)",
    "sub": "Are all optimizers finitely multipodal?",
    "model": "The general finite-multipodality problem",
    "type": "open",
    "note": "The ARW2026 preprint gives existence results under analytic independence and generic/nonextremal hypotheses. The claim about all optimizers additionally requires isolation. It is not a classification at every (e,t).",
    "refs": [
      "ARW2026",
      "RS2025"
    ]
  },
  {
    "region": "Full A / B / C transition curves",
    "sub": "An exact global map",
    "model": "Most boundaries, junctions and reentrant structures",
    "type": "open",
    "note": "The overall KRRS2017 portrait is a deliberately distorted numerical conjecture. Exact phase regions cannot be reconstructed from its image pixels.",
    "refs": [
      "KRRS2017"
    ]
  }
];
