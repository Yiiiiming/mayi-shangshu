package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"time"
)

var version = "dev"

type readyInfo struct {
	URL     string `json:"url"`
	PID     int    `json:"pid"`
	Version string `json:"version"`
}

func main() {
	prepareConsole()
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "观棋揭棋：", err)
		os.Exit(1)
	}
}

func run() error {
	port := flag.Int("port", 18765, "Local port; 0 chooses a free port")
	noBrowser := flag.Bool("no-browser", false, "Do not open the browser automatically")
	readyFile := flag.String("ready-file", "", "Write the local URL, PID and version to this JSON file")
	flag.Parse()
	if flag.NArg() != 0 {
		return errors.New("不支持的位置参数")
	}
	portWasSet := false
	flag.Visit(func(f *flag.Flag) { if f.Name == "port" { portWasSet = true } })
	if *port < 0 || *port > 65535 {
		return errors.New("端口必须在 0 到 65535 之间")
	}
	executable, err := os.Executable()
	if err != nil { return err }
	executable, err = filepath.EvalSymlinks(executable)
	if err != nil { return err }
	root := filepath.Join(filepath.Dir(executable), "web")
	handler, err := newStaticHandler(root)
	if err != nil { return fmt.Errorf("找不到完整网页文件，请先解压整个下载包：%w", err) }
	if info, err := os.Stat(filepath.Join(root, "jieqi", "index.html")); err != nil || !info.Mode().IsRegular() {
		return errors.New("缺少 web/jieqi/index.html，请先解压整个下载包")
	}
	listener, err := listenLocal(*port, !portWasSet)
	if err != nil { return fmt.Errorf("无法启动本地服务：%w", err) }
	defer listener.Close()
	url := "http://" + listener.Addr().String() + "/jieqi/"
	server := &http.Server{
		Handler: handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 15 * time.Second,
		IdleTimeout: 60 * time.Second,
		MaxHeaderBytes: 16 << 10,
	}
	serverErrors := make(chan error, 1)
	go func() { serverErrors <- server.Serve(listener) }()
	if *readyFile != "" {
		data, err := json.Marshal(readyInfo{URL: url, PID: os.Getpid(), Version: version})
		if err != nil { return err }
		if err := os.WriteFile(*readyFile, append(data, '\n'), 0600); err != nil {
			return fmt.Errorf("无法写入测试状态文件：%w", err)
		}
	}
	fmt.Println("观棋揭棋 · " + version)
	fmt.Println(url)
	fmt.Println("请保留此窗口，关闭窗口即可退出。")
	if !*noBrowser {
		if err := openBrowser(url); err != nil {
			fmt.Println("请复制上方网址到 Edge 或 Chrome 打开。")
		}
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) { return err }
	case <-ctx.Done():
		shutdownContext, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		return server.Shutdown(shutdownContext)
	}
	return nil
}

func listenLocal(port int, allowFallback bool) (net.Listener, error) {
	if port < 0 || port > 65535 { return nil, errors.New("invalid port") }
	listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	if err != nil && allowFallback && port != 0 {
		return net.Listen("tcp4", "127.0.0.1:0")
	}
	return listener, err
}
