package main

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func testSite(t *testing.T) (string, http.Handler) {
	t.Helper()
	root := filepath.Join(t.TempDir(), "web")
	files := map[string]string{
		"jieqi/index.html": "<!doctype html><title>观棋</title>",
		"jieqi/app.js": "export const test = true;",
		"jieqi/style.css": "body{color:black}",
		"jieqi/engine/abjchess.wasm": "\x00asm",
		"jieqi/engine/nnue-part-1.bin": "0123456789",
		"jieqi/engine/manifest.json": "{}",
		"jieqi/no-index/inside.txt": "not a directory listing",
	}
	for name, content := range files {
		path := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil { t.Fatal(err) }
		if err := os.WriteFile(path, []byte(content), 0644); err != nil { t.Fatal(err) }
	}
	handler, err := newStaticHandler(root)
	if err != nil { t.Fatal(err) }
	return root, handler
}

func request(handler http.Handler, method, path string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "http://127.0.0.1:18765"+path, nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestAssetsAndIsolation(t *testing.T) {
	_, handler := testSite(t)
	for _, test := range []struct{ path, mime string }{
		{"/jieqi/", "text/html; charset=utf-8"},
		{"/jieqi/app.js?v=pick5", "text/javascript; charset=utf-8"},
		{"/jieqi/style.css", "text/css; charset=utf-8"},
		{"/jieqi/engine/abjchess.wasm", "application/wasm"},
		{"/jieqi/engine/nnue-part-1.bin", "application/octet-stream"},
		{"/jieqi/engine/manifest.json", "application/json; charset=utf-8"},
	} {
		t.Run(test.path, func(t *testing.T) {
			w := request(handler, http.MethodGet, test.path)
			if w.Code != http.StatusOK { t.Fatalf("status = %d; body = %q", w.Code, w.Body.String()) }
			if got := w.Header().Get("Content-Type"); got != test.mime { t.Fatalf("MIME = %q, want %q", got, test.mime) }
			for header, want := range map[string]string{
				"Cross-Origin-Opener-Policy": "same-origin",
				"Cross-Origin-Embedder-Policy": "require-corp",
				"Cross-Origin-Resource-Policy": "same-origin",
				"X-Content-Type-Options": "nosniff",
			} {
				if got := w.Header().Get(header); got != want { t.Errorf("%s = %q, want %q", header, got, want) }
			}
		})
	}
}

func TestRootRedirectAndNoListing(t *testing.T) {
	_, handler := testSite(t)
	root := request(handler, http.MethodGet, "/")
	if root.Code != http.StatusFound || root.Header().Get("Location") != "/jieqi/" { t.Fatalf("root redirect: %#v", root.Result()) }
	directory := request(handler, http.MethodGet, "/jieqi")
	if directory.Code != http.StatusMovedPermanently || directory.Header().Get("Location") != "/jieqi/" { t.Fatalf("directory redirect: %#v", directory.Result()) }
	for _, path := range []string{"/jieqi/no-index/", "/does-not-exist", "/outside.txt"} {
		if w := request(handler, http.MethodGet, path); w.Code != http.StatusNotFound { t.Fatalf("%s: status = %d", path, w.Code) }
	}
}

func TestHeadAndModelByteRange(t *testing.T) {
	_, handler := testSite(t)
	head := request(handler, http.MethodHead, "/jieqi/engine/nnue-part-1.bin")
	if head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Length") != "10" { t.Fatalf("HEAD response: %#v / %q", head.Result(), head.Body.String()) }
	r := httptest.NewRequest(http.MethodGet, "http://localhost:18765/jieqi/engine/nnue-part-1.bin", nil)
	r.Header.Set("Range", "bytes=2-5")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusPartialContent || w.Body.String() != "2345" { t.Fatalf("range: %d %q", w.Code, w.Body.String()) }
}

func TestOnlyLocalHostAndReadMethods(t *testing.T) {
	_, handler := testSite(t)
	for _, host := range []string{"evil.example", "localhost.evil.example:18765", "127.0.0.1.evil.example", "0.0.0.0:18765"} {
		r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/jieqi/", nil)
		r.Host = host
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != http.StatusForbidden { t.Fatalf("host %q: %d", host, w.Code) }
	}
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions} {
		w := request(handler, method, "/jieqi/index.html")
		if w.Code != http.StatusMethodNotAllowed || w.Header().Get("Allow") != "GET, HEAD" { t.Fatalf("method %s: %#v", method, w.Result()) }
	}
}

func TestTraversalAndWindowsAliasesAreRejected(t *testing.T) {
	_, handler := testSite(t)
	for _, path := range []string{
		"/../outside.txt", "/jieqi/../../outside.txt", "/%2e%2e/outside.txt",
		"/jieqi/%2e%2e/index.html", "/jieqi/%5c..%5coutside.txt", "/jieqi/C%3a/Windows/win.ini",
		"/jieqi/app.js%3aother", "/jieqi/.hidden", "/jieqi/index.html.", "/jieqi/index.html%20", "/jieqi/%00",
	} {
		w := request(handler, http.MethodGet, path)
		if w.Code != http.StatusNotFound { t.Fatalf("%s: status = %d", path, w.Code) }
	}
}

func TestSymlinksCannotEscapeWebRoot(t *testing.T) {
	root, handler := testSite(t)
	outside := filepath.Join(filepath.Dir(root), "outside.txt")
	if err := os.WriteFile(outside, []byte("private"), 0600); err != nil { t.Fatal(err) }
	if err := os.Symlink(outside, filepath.Join(root, "jieqi", "escape.txt")); err != nil { t.Skip("symlinks unavailable: ", err) }
	w := request(handler, http.MethodGet, "/jieqi/escape.txt")
	if w.Code != http.StatusNotFound || strings.Contains(w.Body.String(), "private") { t.Fatalf("escape response: %d %q", w.Code, w.Body.String()) }
}

func TestRootMustExistAndBeDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing")
	if _, err := newStaticHandler(path); err == nil { t.Fatal("missing root accepted") }
	if err := os.WriteFile(path, []byte("file"), 0600); err != nil { t.Fatal(err) }
	if _, err := newStaticHandler(path); err == nil { t.Fatal("file root accepted") }
}

func TestListenerIsLoopbackAndFallsBackOnlyWhenRequested(t *testing.T) {
	first, err := listenLocal(0, false)
	if err != nil { t.Fatal(err) }
	defer first.Close()
	host, portText, err := net.SplitHostPort(first.Addr().String())
	if err != nil || host != "127.0.0.1" { t.Fatalf("not loopback: %s", first.Addr()) }
	port, err := strconv.Atoi(portText)
	if err != nil || port == 0 { t.Fatalf("no port: %s", portText) }
	if second, err := listenLocal(port, false); err == nil { second.Close(); t.Fatal("explicit occupied port accepted") }
	fallback, err := listenLocal(port, true)
	if err != nil { t.Fatal(err) }
	defer fallback.Close()
	if fallback.Addr().String() == first.Addr().String() { t.Fatal("fallback reused occupied port") }
	for _, port := range []int{-1, 65536} {
		if listener, err := listenLocal(port, true); err == nil { listener.Close(); t.Fatalf("bad port %d accepted", port) }
	}
}

func TestRealHTTPServerReturnsApp(t *testing.T) {
	_, handler := testSite(t)
	server := httptest.NewServer(handler)
	defer server.Close()
	response, err := http.Get(server.URL + "/jieqi/")
	if err != nil { t.Fatal(err) }
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil { t.Fatal(err) }
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), "观棋") { t.Fatalf("actual HTTP: %d %q", response.StatusCode, body) }
}
