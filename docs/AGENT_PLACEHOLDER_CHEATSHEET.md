# VCPChat 新建智能体占位符速查清单

适用时间：2026-04-11。  
来源：本机 `E:\2026\VCPToolBox\config.env`、`E:\2026\VCPToolBox\toolbox_map.json`、`E:\2026\VCPToolBox\Plugin\*/plugin-manifest.json`、`E:\2026\VCPChat\VCPDistributedServer\Plugin\*/plugin-manifest.json`。

## 先记这 5 条

1. 新建智能体最稳的基础是：`{{TarSysPrompt}}`。
2. `{{TarSysPrompt}}` 当前等于：`{{VarTimeNow}}` + `{{VarVCPGuide}}` + `{{VCPAllTools}}`。
3. 不要一上来把所有 `{{VCP...}}` 都塞进提示词。工具太多会让 Agent 更乱。
4. 常用能力优先用工具箱聚合占位符，例如 `{{VCPMemoToolBox}}`、`{{VCPSearchToolBox}}`、`{{VCPFileToolBox}}`。
5. Agent/Toolbox/Var/Tar/静态占位符主要在 system prompt 里展开，普通用户消息里直接写通常不会展开。

## 推荐默认模板

通用智能体可以从这个开始：

```text
你是【智能体名字】。
你的定位：【一句话说明它负责什么】。
用户是：{{VarUser}}。
用户补充信息：{{VarUserInfo}}。
系统信息：{{VarSystemInfo}}。

{{TarSysPrompt}}

你可以按需使用这些能力：
{{VCPMemoToolBox}}
{{VCPSearchToolBox}}
{{VCPContactToolBox}}

输出要求：
- 优先直接解决用户问题。
- 需要外部信息、文件、记忆、网页、桌面操作时，主动调用 VCP 工具，不要假装已经调用。
- 工具调用后不要编造结果，等待工具真实返回。
- 涉及删除、覆盖、运行命令、联网发布、隐私数据时，先向用户确认。
```

我已经把可直接选用的模板放在：

- `E:\2026\VCPChat\AppData\systemPromptPresets\00-新建智能体模板-通用助手.md`
- `E:\2026\VCPChat\AppData\systemPromptPresets\01-新建智能体模板-搜索研究.md`
- `E:\2026\VCPChat\AppData\systemPromptPresets\02-新建智能体模板-桌面文件代码.md`

## 占位符类型总览

| 类型 | 写法 | 来源 | 作用 | 新建 Agent 是否常用 |
| --- | --- | --- | --- | --- |
| 核心模板 | `{{TarSysPrompt}}` | `config.env` | 注入时间、工具调用指南、全部工具摘要 | 必用 |
| 工具调用指南 | `{{VarVCPGuide}}` | `config.env` | 告诉模型 VCP 工具请求格式 | 通常不用单独写 |
| 全工具摘要 | `{{VCPAllTools}}` | 插件管理器动态生成 | 注入全部可调用工具的简表 | 已包含在 `TarSysPrompt` |
| 工具箱聚合 | `{{VCPMemoToolBox}}` 等 | `toolbox_map.json` + `TVStxt/*.txt` | 注入某类工具的详细说明 | 推荐 |
| 单工具说明 | `{{VCPXiaohongshuFetch}}` 等 | 插件 manifest | 注入某个插件的详细调用说明 | 按需 |
| 运行时数据 | `{{VCPDailyHot}}` 等 | 静态插件输出 | 注入实时/周期性数据 | 按需 |
| 通用变量 | `{{VarUser}}` 等 | `config.env` | 用户、系统、路径、渲染能力等信息 | 推荐少量 |
| 高优先级模板 | `{{TarEmojiPrompt}}` 等 | `config.env` | 表情包、系统模板等 | 按角色需要 |
| 模型条件提示 | `{{SarPrompt1}}` 等 | `config.env` | 只对指定模型生效的额外提示 | 谨慎 |
| 时间变量 | `{{Date}}`、`{{Time}}` | 内置 | 当前日期、时间、星期、农历 | 通常由 `VarTimeNow` 间接使用 |
| Agent 引用 | `{{agent:Alias}}` 或 `{{Alias}}` | `agent_map.json` | 引入后端 Agent 文本 | 当前本机未配置 `agent_map.json` |
| Tavern 预设 | `{{VCPTavern::预设名}}` | VCPTavern 插件 | 注入酒馆/角色预设上下文 | 高级用法 |

## 最常用工具箱

这些比单独塞几十个工具更适合新建智能体。

| 占位符 | 文件 | 作用 | 推荐给谁 |
| --- | --- | --- | --- |
| `{{VCPMemoToolBox}}` | `MemoToolBox.txt` | LightMemo、DeepMemo、TopicMemo 等记忆/回忆能力 | 长期陪伴、助理、研究型 Agent |
| `{{VCPSearchToolBox}}` | `SearchToolBox.txt` | 联网检索、网页抓取、B站、小红书、论文/网页信息采集 | 搜索、研究、运营、内容分析 Agent |
| `{{VCPFileToolBox}}` | `FileToolBox.txt` | 文件读写、代码搜索、命令行、项目操作 | 文件、代码、桌面工作流 Agent |
| `{{VCPMediaToolBox}}` | `MediaToolBox.txt` | 图片、视频、音乐、多媒体生成与处理 | 创作、设计、视频 Agent |
| `{{VCPContactToolBox}}` | `ContactToolBox.txt` | 消息推送、话题、日程、联系人、日常小工具 | 管家、提醒、协作 Agent |

## config.env 中的 Tar / Var / Sar

| 占位符 | 当前值或来源 | 用途 | 建议 |
| --- | --- | --- | --- |
| `{{TarSysPrompt}}` | `{{VarTimeNow}}\n\n{{VarVCPGuide}}\n\n{{VCPAllTools}}` | 核心系统能力包 | 新建 Agent 必带 |
| `{{TarEmojiPrompt}}` | `config.env` 内长文本 | 表情包图床与插图格式说明 | 角色需要表情包时加 |
| `{{TarEmojiList}}` | `通用表情包.txt` | 通用表情包列表文件 | 通常由表情包逻辑间接用 |
| `{{VarToolList}}` | `supertool.txt` | 旧版 VCP 工具调用总格式说明 | 已有 `TarSysPrompt` 时可不加 |
| `{{VarVCPGuide}}` | `config.env` 内工具请求格式 | 工具调用格式指南 | 已包含在 `TarSysPrompt` |
| `{{VarDailyNoteGuide}}` | `Dailynote.txt` | 日记/长期记忆写入说明 | 陪伴型 Agent 推荐 |
| `{{VarFileTool}}` | `filetool.txt` | 文件操作详细说明 | 文件型 Agent 可加 |
| `{{VarForum}}` | `ToolForum.txt` | 论坛工具说明 | 论坛/社区 Agent 可加 |
| `{{VarMIDITranslator}}` | `MIDITranslator.txt` | MIDI 翻译工具说明 | 音乐 Agent 可加 |
| `{{VarTimeNow}}` | `今天是{{Date}},{{Today}},{{Festival}}。现在是{{Time}}。` | 当前日期时间 | 已包含在 `TarSysPrompt` |
| `{{VarSystemInfo}}` | `YOUR_SYSTEM_INFO...` | 当前系统描述 | 推荐写进身份区 |
| `{{VarCity}}` | `YOUR_CITY...` | 天气/城市相关 | 天气 Agent 可加 |
| `{{VarUser}}` | `YOUR_USER_DESCRIPTION...` | 用户称呼/身份 | 推荐写进身份区 |
| `{{VarUserInfo}}` | `YOUR_USER_INFO...` | 用户补充信息 | 推荐写进身份区 |
| `{{VarHome}}` | `YOUR_HOME_DESCRIPTION...` | 家/环境描述 | 陪伴型 Agent 可加 |
| `{{VarTeam}}` | `config.env` 内团队描述 | 团队成员信息 | 多 Agent 协作可加 |
| `{{VarVchatPath}}` | `YOUR_VCHAT_PATH...` | VCPChat 路径 | 工具型 Agent 可加 |
| `{{VarDivRender}}` | `DIVRendering.txt` | Div 渲染说明文件 | 高级渲染 Agent 可加 |
| `{{VarRendering}}` | `config.env` 内长文本 | VChat 气泡渲染/HTML/图表说明 | 需要漂亮输出时加 |
| `{{VarDesktop}}` | `DesktopCore.txt` | 桌面能力说明 | 桌面 Agent 可加 |
| `{{VarAdaptiveBubbleTip}}` | `config.env` 内长文本 | 主题自适应气泡写法 | UI/主题 Agent 可加 |
| `{{VarHttpUrl}}` | `http://localhost` | HTTP 图床/文件服务基础地址 | 图片/文件链接用 |
| `{{VarHttpsUrl}}` | `https://your-domain.com/` | HTTPS 地址 | 外网部署才用 |
| `{{VarDdnsUrl}}` | `http://your-ddns-provider.com` | DDNS 地址 | 外网部署才用 |
| `{{SarPrompt1}}` | 绑定 Gemini 2.5 Flash Preview | 泛化、深度思考提示 | 谨慎，不要滥用 |
| `{{SarPrompt2}}` | 绑定 grok-3-beta | TTS 口语纠错提示 | 语音聊天 Agent 可用 |
| `{{SarPrompt3}}` | 绑定 Gemini 2.5 Pro/Flash 等 | 高强度思考模式提示 | 谨慎，可能增加输出负担 |
| `{{SarPrompt4}}` | 绑定 Gemini 3 Pro 预览 | 元思考简报转最终交付 | 特定工作流才用 |

## 内置时间与系统变量

| 占位符 | 含义 |
| --- | --- |
| `{{Date}}` | 当前日期 |
| `{{Time}}` | 当前时间 |
| `{{Today}}` | 当前星期 |
| `{{Festival}}` | 农历、生肖、节气信息 |
| `{{Port}}` | 后端端口，当前通常是 `6005` |
| `{{Image_Key}}` | 图片服务鉴权 Key，由 ImageServer 解析 |
| `{{VCP_ASYNC_RESULT::Plugin::requestId}}` | 异步工具结果占位符，通常系统自动生成 |

## 静态数据占位符

这些不是“工具调用说明”，而是把插件周期性生成的数据塞进系统提示词。

| 占位符 | 插件 | 作用 |
| --- | --- | --- |
| `{{ArxivDailyPapersData}}` | ArxivDailyPapers | Arxiv 每日论文 |
| `{{CrossRefDailyPapersData}}` | CrossRefDailyPapers | CrossRef 每日论文 |
| `{{FRPSAllProxyInfo}}` | FRPSInfoProvider | FRPS 代理/设备信息 |
| `{{USER_AUTH_CODE}}` | UserAuth | 每小时更新的 6 位认证码 |
| `{{VCPChromePageInfo}}` | ChromeBridge | 当前 Chrome 活动页摘要 |
| `{{VCPDailyHot}}` | DailyHot | 主流平台实时热榜 |
| `{{VCPFileServer}}` | FileListGenerator | `file` 目录文件列表 |
| `{{VCPFilestructureInfo}}` | FileTreeGenerator | 指定目录结构树 |
| `{{VCPForumLister}}` | VCPForumLister | VCP 论坛帖子列表 |
| `{{VCPWeatherInfoNow}}` | WeatherInfoNow | 简短实时天气 |
| `VCPNextSchedule` | ScheduleBriefing | 下一个日程安排。注意：当前 manifest 里是裸文本，不是 `{{...}}` 格式 |

## 后端本地工具说明占位符

写法规律：插件名是 `XiaohongshuFetch`，提示词里写 `{{VCPXiaohongshuFetch}}`。

| 占位符 | 工具名 | 用途概括 |
| --- | --- | --- |
| `{{VCPAgentAssistant}}` | AgentAssistant | 多 Agent 协作 |
| `{{VCPAgentMessage}}` | AgentMessage | Agent 消息推送 |
| `{{VCPAnimeFinder}}` | AnimeFinder | 以图找番 |
| `{{VCPArtistMatcher}}` | ArtistMatcher | 画师匹配查询 |
| `{{VCPBilibiliFetch}}` | BilibiliFetch | Bilibili 内容获取 |
| `{{VCPChromeBridge}}` | ChromeBridge | Chrome 浏览器桥接 |
| `{{VCPComfyCloudGen}}` | ComfyCloudGen | 云端图像/视频生成 |
| `{{VCPComfyUIGen}}` | ComfyUIGen | ComfyUI 图像生成 |
| `{{VCPDailyNote}}` | DailyNote | 日记创建与更新 |
| `{{VCPDeepWikiVCP}}` | DeepWikiVCP | DeepWiki 抓取 |
| `{{VCPDMXDoubaoGen}}` | DMXDoubaoGen | 豆包图像生成 |
| `{{VCPDoubaoGen}}` | DoubaoGen | 豆包图像生成 |
| `{{VCPFlashDeepSearch}}` | FlashDeepSearch | 深度研究 |
| `{{VCPFluxGen}}` | FluxGen | Flux 图像生成 |
| `{{VCPGeminiImageGen}}` | GeminiImageGen | Gemini 图像生成/编辑 |
| `{{VCPGoogleSearch}}` | GoogleSearch | Google API 搜索 |
| `{{VCPGrokVideoGen}}` | GrokVideoGen | Grok 视频生成 |
| `{{VCPJapaneseHelper}}` | JapaneseHelper | 日语学习辅助 |
| `{{VCPKarakeepSearch}}` | KarakeepSearch | 书签搜索 |
| `{{VCPKEGGSearch}}` | KEGGSearch | KEGG 数据库查询 |
| `{{VCPLightMemo}}` | LightMemo | 轻量回忆 |
| `{{VCPLinuxLogMonitor}}` | LinuxLogMonitor | Linux 日志监控 |
| `{{VCPLinuxShellExecutor}}` | LinuxShellExecutor | Linux Shell 执行 |
| `{{VCPMagiAgent}}` | MagiAgent | 三贤者会议系统 |
| `{{VCPNanoBananaGen2}}` | NanoBananaGen2 | Gemini 3 图像生成 |
| `{{VCPNanoBananaGenOR}}` | NanoBananaGenOR | Gemini 2.5 图像生成 |
| `{{VCPNCBIDatasets}}` | NCBIDatasets | NCBI 数据查询 |
| `{{VCPNovelAIGen}}` | NovelAIGen | NovelAI 绘图 |
| `{{VCPPaperReader}}` | PaperReader | 论文/超文本递归阅读 |
| `{{VCPProjectAnalyst}}` | ProjectAnalyst | 项目分析 |
| `{{VCPPubMedSearch}}` | PubMedSearch | PubMed 文献检索 |
| `{{VCPPyCameraCapture}}` | PyCameraCapture | 摄像头捕获 |
| `{{VCPPyScreenshot}}` | PyScreenshot | 屏幕截图 |
| `{{VCPQwenImageGen}}` | QwenImageGen | 通义千问图片生成 |
| `{{VCPRandomness}}` | Randomness | 随机事件 |
| `{{VCPRiverTestPlugin}}` | RiverTestPlugin | River Context API 测试 |
| `{{VCPScheduleManager}}` | ScheduleManager | 日程管理 |
| `{{VCPSciCalculator}}` | SciCalculator | 科学计算 |
| `{{VCPSemanticGroupEditor}}` | SemanticGroupEditor | 语义组编辑 |
| `{{VCPSerpSearch}}` | SerpSearch | 多搜索引擎 |
| `{{VCPServerCodeSearcher}}` | ServerCodeSearcher | 后端代码搜索 |
| `{{VCPServerFileOperator}}` | ServerFileOperator | 后端文件操作 |
| `{{VCPServerPowerShellExecutor}}` | ServerPowerShellExecutor | 后端 PowerShell |
| `{{VCPServerSearchController}}` | ServerSearchController | 后端 Everything 搜索 |
| `{{VCPServerTencentCOSBackup}}` | ServerTencentCOSBackup | 腾讯云 COS 备份 |
| `{{VCPSnowBridge}}` | SnowBridge | Snow 工具桥接 |
| `{{VCPSunoGen}}` | SunoGen | Suno 音乐生成 |
| `{{VCPSVCardFinder}}` | SVCardFinder | 影之诗查卡 |
| `{{VCPTarotDivination}}` | TarotDivination | 塔罗占卜 |
| `{{VCPTavilySearch}}` | TavilySearch | Tavily 搜索 |
| `{{VCPThoughtClusterManager}}` | ThoughtClusterManager | 思维簇管理 |
| `{{VCPUrlFetch}}` | UrlFetch | URL 内容获取 |
| `{{VCPVCPForum}}` | VCPForum | VCP 论坛 |
| `{{VCPVCPForumOnline}}` | VCPForumOnline | VCP 在线论坛 |
| `{{VCPVCPToolBridge}}` | VCPToolBridge | VCP 工具桥接 |
| `{{VCPVSearch}}` | VSearch | 语义并发搜索 |
| `{{VCPWan2.1VideoGen}}` | Wan2.1VideoGen | Wan2.1 视频生成 |
| `{{VCPWebUIGen}}` | WebUIGen | WebUI 云算力生图 |
| `{{VCPXiaohongshuFetch}}` | XiaohongshuFetch | 小红书抓取 |
| `{{VCPZImageGen}}` | ZImageGen | Z-Image 文生图 |
| `{{VCPZImageGen2}}` | ZImageGen2 | Z-Image Base 文生图 |
| `{{VCPZImageTurboGen}}` | ZImageTurboGen | Z-Image Turbo 绘图 |

## VCPChat 分布式工具说明占位符

这些来自 `E:\2026\VCPChat\VCPDistributedServer\Plugin`，桌面端分布式服务器连上后会注册给后端。

| 占位符 | 工具名 | 用途概括 |
| --- | --- | --- |
| `{{VCPBladeGame}}` | BladeGame | 华山论剑 |
| `{{VCPChatTencentcos}}` | ChatTencentcos | 聊天侧腾讯云 COS 上传/下载 |
| `{{VCPCodeSearcher}}` | CodeSearcher | 桌面侧代码搜索 |
| `{{VCPDeepMemo}}` | DeepMemo | 深度回忆 |
| `{{VCPDesktopRemote}}` | DesktopRemote | 桌面远程控制、组件、壁纸、Dock |
| `{{VCPFileOperator}}` | FileOperator | 桌面侧文件操作 |
| `{{VCPFlowlock}}` | Flowlock | 心流锁控制 |
| `{{VCPLocalSearchController}}` | LocalSearchController | 本地 Everything 搜索 |
| `{{VCPMediaShot}}` | MediaShot | 多媒体截取 |
| `{{VCPMusicController}}` | MusicController | 音乐播放器控制 |
| `{{VCPOldPowerShellExecutor}}` | OldPowerShellExecutor | 旧 PowerShell 执行器 |
| `{{VCPPowerShellExecutor}}` | PowerShellExecutor | PowerShell 执行器 |
| `{{VCPPromptSponsor}}` | PromptSponsor | 提示词仓库/模块化提示词管理 |
| `{{VCPPTYShellExecutor}}` | PTYShellExecutor | PTY Shell 执行 |
| `{{VCPScreenPilot}}` | ScreenPilot | 屏幕视觉与操控 |
| `{{VCPSuperDice}}` | SuperDice | 骰子 |
| `{{VCPTableLampRemote}}` | TableLampRemote | 米家台灯遥控 |
| `{{VCPTopicMemo}}` | TopicMemo | 话题回忆 |
| `{{VCPTopicSponsor}}` | TopicSponsor | 主动创建/读取/回复话题 |
| `{{VCPVCPAlarm}}` | VCPAlarm | 闹钟 |
| `{{VCPWaitingForUrReply}}` | WaitingForUrReply | 等待用户回复 |

## 按场景怎么选

| 场景 | 推荐组合 |
| --- | --- |
| 普通聊天/管家 | `{{TarSysPrompt}}` + `{{VCPMemoToolBox}}` + `{{VCPContactToolBox}}` |
| 搜索研究/爬虫 | `{{TarSysPrompt}}` + `{{VCPSearchToolBox}}` + `{{VCPMemoToolBox}}` |
| 文件/代码/项目助手 | `{{TarSysPrompt}}` + `{{VCPFileToolBox}}` + `{{VCPMemoToolBox}}` |
| 桌面控制/自动化 | `{{TarSysPrompt}}` + `{{VCPFileToolBox}}` + `{{VarDesktop}}` + `{{VCPDesktopRemote}}` |
| 视觉/设计/绘图 | `{{TarSysPrompt}}` + `{{VCPMediaToolBox}}` + `{{VarRendering}}` |
| 长期陪伴/日记 | `{{TarSysPrompt}}` + `{{VCPMemoToolBox}}` + `{{VarDailyNoteGuide}}` |
| 论坛/社区 | `{{TarSysPrompt}}` + `{{VarForum}}` + `{{VCPForumLister}}` |

## 常见坑

| 坑 | 正确做法 |
| --- | --- |
| 把几十个 `{{VCP...}}` 全塞进系统提示词 | 优先用 `{{VCPAllTools}}` 或工具箱聚合 |
| 以为 `{{VCPXxx}}` 会直接执行工具 | 它只是注入工具说明，真正执行要输出 `<<<[TOOL_REQUEST]>>>` |
| 在用户消息里写占位符测试 | 大多数占位符只在 system prompt 展开 |
| `{{agent:Alias}}` 没展开 | 当前本机没有 `E:\2026\VCPToolBox\agent_map.json`，需要先配置映射 |
| 工具调用后模型自己编结果 | 在智能体提示词里强调“等待工具真实返回，不编造结果” |
| 桌面和后端文件工具混用 | 桌面侧用 `FileOperator`，后端侧用 `ServerFileOperator` |
| VCPLog 1006 | 检查 `vcpLogKey` 是否为后端 `VCP_Key`，不是聊天 API 的 `Key` |
