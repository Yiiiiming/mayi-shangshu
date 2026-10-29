Full AB-JChess v0.2d browser engine
=================================

The worker runs the full upstream NNUE/search code locally. First use loads
approximately 144 MB of network data and verifies its SHA-256. Later visits
reuse verified chunks from Cache Storage when available. No server engine is
required. A recent browser with WASM SIMD, pthreads, SharedArrayBuffer and a
cross-origin isolated page is required. Memory use can be substantial.

Classic Worker interface
------------------------
init: {type:'init', jsUrl, wasmUrl, manifestUrl}
command: {type:'command', command:'one UCI command'}
URLs should be absolute. manifestUrl may be omitted to use manifest.json
alongside worker.js. Events: ready, line, stderr, net-progress, net-written,
cache-warning, error. A line event has a `line` string; errors use `error`.
Progress includes loaded and total byte counts and whether a cached chunk
was used. The EvalFile path is /abjchess-20261010.nnue.

After ready, send uci, setoption name MultiPV value 5,
setoption name UCI_ShowWDL value true, the position command, then go.
The engine receives only the acting observer's legal history. The page's
game referee is responsible for never sending unseen piece identities.
Reported WDL values are model estimates, not known outcomes. A mate value
is passed through without scaling; the UI may display e.g. 3步杀 or 对手3步杀.

Rebuild
-------
Install and activate the official Emscripten SDK version 3.1.74. Extract the
included source archive into an empty work directory (strip its first path
component), then apply source.patch with `patch -p1` in that directory.
Run `bash build.sh /absolute/path/to/patched/source /absolute/output/path`.
The output is abjchess.js plus abjchess.wasm. The build uses SIMD and up to
four pooled pthreads. It does not embed or trim the network.

manifest.json specifies each chunk's original byte count and SHA-256.
Concatenate the three chunks to reconstruct the original EvalFile.
Run `node verify.cjs` in this directory's parent context or from any other
working directory to execute two actual MultiPV/WDL searches. This writes
wasm-verification.json beside the script. It requires Node with WASM SIMD
and worker_threads support; it does not test page isolation or browser UI.

See ORIGIN.txt, LICENSE, AUTHORS, and NNUE-NOTICE.txt for attribution and
license information. SHA256SUMS lists the exact files in this build.
