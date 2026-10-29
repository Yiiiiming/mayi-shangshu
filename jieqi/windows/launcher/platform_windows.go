//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func prepareConsole() {
	// Keep the short Chinese instructions readable in the Windows console.
	_, _, _ = syscall.NewLazyDLL("kernel32.dll").NewProc("SetConsoleOutputCP").Call(65001)
}

func openBrowser(url string) error {
	root := os.Getenv("SystemRoot")
	if root == "" { root = `C:\Windows` }
	return exec.Command(filepath.Join(root, "System32", "rundll32.exe"), "url.dll,FileProtocolHandler", url).Start()
}
