package main

import (
	"fmt"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Only package files beneath web/ are served. Directory listing is disabled.
func newStaticHandler(root string) (http.Handler, error) {
	root, err := filepath.Abs(root)
	if err != nil { return nil, err }
	root, err = filepath.EvalSymlinks(root)
	if err != nil { return nil, err }
	info, err := os.Stat(root)
	if err != nil { return nil, err }
	if !info.IsDir() { return nil, fmt.Errorf("web is not a directory") }
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-cache")
		if !localHost(r.Host) {
			http.Error(w, "Local access only", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/jieqi/", http.StatusFound)
			return
		}
		if !safeURLPath(r.URL.Path) {
			http.NotFound(w, r)
			return
		}
		candidate := filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/")))
		resolved, err := filepath.EvalSymlinks(candidate)
		if err != nil || !withinRoot(root, resolved) {
			http.NotFound(w, r)
			return
		}
		info, err := os.Stat(resolved)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if info.IsDir() {
			if !strings.HasSuffix(r.URL.Path, "/") {
				u := *r.URL
				u.Path += "/"
				http.Redirect(w, r, u.String(), http.StatusMovedPermanently)
				return
			}
			resolved, err = filepath.EvalSymlinks(filepath.Join(resolved, "index.html"))
			if err != nil || !withinRoot(root, resolved) {
				http.NotFound(w, r)
				return
			}
		}
		file, err := os.Open(resolved)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer file.Close()
		info, err = file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
		if contentType := assetContentType(filepath.Ext(resolved)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		http.ServeContent(w, r, info.Name(), info.ModTime(), file)
	}), nil
}

func localHost(host string) bool {
	name, _, err := net.SplitHostPort(host)
	if err != nil { name = host }
	return name == "127.0.0.1" || strings.EqualFold(name, "localhost")
}

func safeURLPath(p string) bool {
	if !strings.HasPrefix(p, "/") || strings.ContainsAny(p, "\\:\x00") { return false }
	for _, part := range strings.Split(p, "/") {
		if part == "" { continue }
		if strings.HasPrefix(part, ".") || strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") { return false }
	}
	return true
}

func withinRoot(root, name string) bool {
	rel, err := filepath.Rel(root, name)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func assetContentType(extension string) string {
	switch strings.ToLower(extension) {
	case ".js", ".mjs": return "text/javascript; charset=utf-8"
	case ".wasm": return "application/wasm"
	case ".bin": return "application/octet-stream"
	case ".html": return "text/html; charset=utf-8"
	case ".css": return "text/css; charset=utf-8"
	case ".json": return "application/json; charset=utf-8"
	case ".svg": return "image/svg+xml"
	default: return mime.TypeByExtension(extension)
	}
}
