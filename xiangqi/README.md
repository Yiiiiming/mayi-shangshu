# 观棋 · 中国象棋 AI

完整 Pikafish + NNUE 在浏览器中运行的象棋分析器。使用访问者设备的 CPU 和内存，没有云端分析服务，也没有轻量搜索回退。

在线地址：https://yiiiiming.github.io/mayi-shangshu/xiangqi/

## 功能

- 5–20 路候选，棋盘显示排名、胜率和起止箭头。
- 直接读取引擎的胜／和／负预测，不把和棋计入胜率。
- 10、30、60、120 秒思考，最高8线程、64–256MB缓存。
- AI对弈、自由分析、后退/前进、翻转、浏览器棋谱保存。
- 首次下载50,706,378字节NNUE并校验SHA256；之后复用浏览器缓存。

## 运行

通过HTTPS打开在线地址，推荐新版Chrome、Edge、Firefox或Safari。服务工作线程仅作用于本目录，为完整多线程WASM提供所需跨源隔离环境；首次打开可能自动刷新一次。应用内置浏览器如果不支持，请改用独立浏览器。

本地开发可以使用静态HTTP服务器打开此目录，localhost也支持上述隔离流程。不支持直接双击HTML通过file://运行。

GitHub Actions仅下载并校验固定版本的引擎资产后保存到本目录，日常算棋不消耗Actions或服务器算力。

## 引擎

主线Pikafish提交：`6a59ee2f7b105bff64d9efc2692591107787e2b1`，2026-09-19。

浏览器构建：[brianhliou/pikafish-wasm v0.1.0](https://github.com/brianhliou/pikafish-wasm/releases/tag/v0.1.0)。完整核心、NNUE、对应源码、构建脚本与许可证见 `engine/`。`engine/ORIGIN.txt` 记录精确版本与修改范围。

胜和负为引擎模型估计，不是针对任意对手的保证。棋盘暂未实现完整竞赛中的长将、长捉及无吃子回合裁决；引擎接收完整走步历史。

## 许可

引擎及修改过的集成代码按GPL-3.0-or-later提供，完整对应源码与浏览器构建补丁公开。NNUE采用单独的上游许可，含非商业限制，见 `engine/NNUE-License.md`。
