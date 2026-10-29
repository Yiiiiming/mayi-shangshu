//go:build !windows

package main

import (
	"fmt"
	"os/exec"
	"runtime"
)

func prepareConsole() {}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin": return exec.Command("open", url).Start()
	case "linux": return exec.Command("xdg-open", url).Start()
	default: return fmt.Errorf("automatic browser opening is unavailable")
	}
}
