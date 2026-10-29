# Windows portable launcher

No third-party Go modules or installed runtime are required. Build this directory with `go build -trimpath -ldflags="-s -w -X main.version=VERSION" -o 观棋揭棋.exe .` on Windows, or set `GOOS=windows GOARCH=amd64 CGO_ENABLED=0` when cross-compiling. Run `go test ./...` first.

Package layout:

```
观棋揭棋.exe
web/
  jieqi/
    index.html
    app.js
    ...all browser application and full engine files...
```

The user extracts the complete ZIP and double-clicks the executable. Their default browser opens `/jieqi/`. The console remains open; closing it ends the local service. No system installation, elevated rights, firewall rule, or extra runtime is required. All listening is restricted to `127.0.0.1`.

Port `18765` is tried by default, preserving the browser cache origin between launches. If unavailable, a free local port is used. `-port 0` explicitly selects a free port; an explicit nonzero `-port` is strict and fails if occupied. `-no-browser` suppresses automatic browser opening.

For a Windows smoke test, run `观棋揭棋.exe -no-browser -port 0 -ready-file ready.json`. The JSON contains `url`, `pid`, and `version`, for example `{"url":"http://127.0.0.1:49152/jieqi/","pid":1234,"version":"2026.10.29"}`. The file is written only after the listener starts. Stop the recorded process after checking the URL. The executable always finds `web/` beside itself, regardless of the current working directory.

The server sets the isolation headers needed by the threaded WebAssembly engine, fixes JavaScript/WASM/binary MIME types, supports byte ranges through Go's standard library, rejects non-GET/HEAD methods, restricts host names to localhost, blocks escaped/symlink paths outside `web/`, and never lists directories.
