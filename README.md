# VCPChat OpenClaw Fork

这是 `VCPChat` 的个人二次开发版本，仓库地址为：

- 前端客户端仓库：[hx676/vcpchat-openclaw](https://github.com/hx676/vcpchat-openclaw)
- 配套后端仓库：[hx676/vcptoolbox-openclaw](https://github.com/hx676/vcptoolbox-openclaw)
- 上游项目：[lioensky/VCPChat](https://github.com/lioensky/VCPChat)

本仓库的定位不是单独运行的聊天壳，而是配合 `VCPToolBox` 使用的桌面前端与可视化入口。当前二开重点已经收口到以下几个方向：

- `VCPChat` 桌面聊天客户端
- `OpenClaw + VCP` 联动后的会话可视化
- 微信 / 飞书等渠道镜像会话展示
- AgentFlow Studio 独立编排前端工作区
- 分布式桌面服务与 `vcp_chat` 工具链路联调

## 这个 Fork 做了什么

相对上游版本，这个仓库当前主要承载了以下定制方向：

- 接入 `OpenClaw` 相关前端配套能力
- 增强渠道镜像展示，让外部渠道消息可以进入 VCPChat 主列表可视化查看
- 增加 AgentFlow Studio 相关前端工作区和演示链路
- 增强与 `VCPToolBox` 的联动，适配当前本地部署方案
- 结合桌面 Distributed Server 做 `vcp_chat` 工具成功链路验证

如果你是从 GitHub 首页进入这个仓库，最应该先知道的一件事是：

> 这个仓库已经不是“纯上游原版”，而是和 `vcptoolbox-openclaw` 成对维护的本地集成版本。

## 配套关系

完整运行通常需要两个仓库一起配合：

1. 后端运行 [vcptoolbox-openclaw](https://github.com/hx676/vcptoolbox-openclaw)
2. 前端桌面端运行当前仓库 `vcpchat-openclaw`

职责划分如下：

- `VCPToolBox`：模型调用、工具执行、记忆/RAG、OpenClaw 集成接口、渠道镜像落盘
- `VCPChat`：桌面聊天、会话查看、镜像展示、AgentFlow Studio 前端、分布式桌面端入口

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动前确认

在启动当前仓库之前，建议先确保：

- `VCPToolBox` 已经安装依赖并启动
- 后端 `config.env` 已完成你的本机配置
- 如需使用分布式桌面能力，已在桌面设置中开启 Distributed Server

### 3. 启动桌面端

```bash
npm start
```

可用脚本：

- `npm start`：正常启动桌面端
- `npm run start:desktop`：仅启动桌面桌面层相关入口
- `npm run start:rag-observer`：仅启动 RAG 观察入口
- `npm run doctor`：做本地环境检查

## 常用目录

- [main.js](/E:/2026/VCPChat/main.js)：Electron 主进程入口
- [renderer.js](/E:/2026/VCPChat/renderer.js)：前端渲染主入口
- [AgentFlowStudio](/E:/2026/VCPChat/AgentFlowStudio)：AgentFlow 独立前端工作区
- [OpenClawmodules](/E:/2026/VCPChat/OpenClawmodules)：OpenClaw 相关桥接/模块
- [docs](/E:/2026/VCPChat/docs)：文档入口

## 文档入口

建议优先看这些文档：

- [DOCUMENTATION_INDEX.md](/E:/2026/VCPChat/docs/DOCUMENTATION_INDEX.md)
- [AGENT_PLACEHOLDER_CHEATSHEET.md](/E:/2026/VCPChat/docs/AGENT_PLACEHOLDER_CHEATSHEET.md)

如果你正在看 AgentFlow：

- 前端侧文档在 `VCPChat/docs`
- 后端 Runtime / Memory 文档在 `VCPToolBox/docs`

## 当前 Fork 的使用建议

这个仓库更适合下面几类用途：

- 作为你自己的 VCP 桌面主客户端
- 用来查看 OpenClaw 渠道镜像会话
- 配合 `VCPToolBox` 做知识库/记忆/工具链联动
- 运行和演示 AgentFlow Studio

不建议把这个 fork 直接当成“无配置即开箱”的纯净发布版，因为它已经包含了较多本地化定制与联调路径。

## 与上游的关系

本仓库保留对上游项目的尊重与引用：

- 上游前端：[lioensky/VCPChat](https://github.com/lioensky/VCPChat)
- 上游后端：[lioensky/VCPToolBox](https://github.com/lioensky/VCPToolBox)

如果你想同步上游新能力，建议以当前仓库为主线，选择性从 upstream 合并，而不是直接覆盖本地定制。

## 说明

- 本仓库不会提交你的本地运行数据、账号信息和私有配置
- GitHub 上看到的是可公开部分，不包含你的本机环境密钥
- 若要完整跑通，请同时参考配套后端仓库的 README

## License

本 fork 继续尊重上游项目原有许可与署名要求。涉及二开部分，请结合上游仓库声明一并理解和使用。
