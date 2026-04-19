# OpenClaw 渠道镜像在 VCPChat 中的显示逻辑

## 文档定位

本文档只解释一件事：

- OpenClaw / 飞书 / 微信的会话，为什么会出现在 VCPChat 主列表
- 为什么这些会话是只读的
- 为什么有时你能看到比镜像文件更多的回复和附件

如果你想看后端完整链路，请同时阅读：

- [VCPToolBox/docs/OPENCLAW_INTEGRATION.md](https://github.com/hx676/vcptoolbox-openclaw/blob/main/docs/OPENCLAW_INTEGRATION.md)

## 会话从哪里来

VCPChat 并不直接读取 OpenClaw 自己的原始会话格式，而是读取 `VCPToolBox` 生成的渠道镜像目录。

镜像根目录的查找顺序是：

1. 读取 `VCPToolBox/config.env` 中的 `CHANNEL_MIRROR_ROOT_PATH`
2. 如果没配置，则回退到：

```text
VCPToolBox/ChannelMirrorData
```

对应代码入口：

- `VCPChat/modules/ipc/channelMirrorHandlers.js`

## 主列表为什么会出现新会话

VCPChat 会扫描镜像根目录下的每个 `session.json`，并把它们包装成一种特殊会话类型：

- `type = channel_mirror`

这些会话项会进入左侧主列表，所以你会看到类似：

- 飞书
- 微信
- 其他镜像渠道

## 为什么是只读的

`channel_mirror` 会话在前端被明确当成只读会话处理。

表现是：

- 禁止输入消息
- 禁止发送
- 禁止附件按钮
- 不允许像普通 Agent 会话那样新建可写话题

当前实现里，VCPChat 的职责只是“查看镜像”，不是“从这里反向回发渠道”。

## 读取的是哪些文件

单个镜像会话的目录结构固定是：

```text
ChannelMirrorData/
└─ <channel>/
   └─ <base64url(conversationId)>/
      ├─ session.json
      └─ topics/
         └─ main/
            ├─ topic.json
            └─ history.json
```

VCPChat 会读取：

- `session.json`
- `topic.json`
- `history.json`

目前默认只有一个主题：

- `main`

## history.json 里有哪些内容

`history.json` 里的事件通常包括：

- 渠道入站消息
- OpenClaw 成功发出的回复
- 渠道发送失败记录
- VCP 工具调用结果
- `memory_write` 结果
- `kb_agent_ask` 结果

所以你在 VCPChat 中看到的不只是聊天正文，也可能看到：

- system 说明
- 工具调用摘要
- 记忆写入结果
- 知识库智能体回答摘要

## 为什么有时“看起来比镜像文件更完整”

因为 VCPChat 在读取 `history.json` 后，还会做一次补全回填。

它会到 OpenClaw 本地 session 目录里继续查：

```text
%USERPROFILE%\\.openclaw\\agents\\<agentId>\\sessions\\*.jsonl
```

这层补全主要用来找：

- assistant 实际发出的文本回复
- 通过 OpenClaw `message.send` 成功发出的文件

### 渠道与 agentId 的当前映射

- `feishu -> feishu`
- `openclaw-weixin -> weixin`
- `qqbot -> qq`

### 回填是怎么关联上的

当前实现会按入站消息中的 `message_id` 做关联。

因此最终你在 VCPChat 里看到的时间线，实际是：

1. 镜像目录里的 `history.json`
2. OpenClaw session JSONL 的补充回复和附件

合并后按时间排序显示。

## 文件附件为什么能显示

当 VCPChat 在 OpenClaw session JSONL 里发现：

- assistant 发起了 `message.send`
- 对应的 `toolResult` 返回发送成功

它会把文件路径补成一个附件对象，并转成可显示的本地文件 URL。

因此你在镜像会话里可以看到：

- 文件名
- 基本 MIME 类型
- 本地文件链接

## 当前限制

当前这套镜像显示链路仍有明确边界：

- 镜像会话是只读的
- 只有 `main` 主题，不做复杂分叉
- VCPChat 不直接写 OpenClaw session
- VCPChat 主要做查看和回放，不做渠道主控

## 最后结论

如果只记一句话：

> VCPChat 看到的飞书 / 微信镜像，不是 OpenClaw 原始 session 的直接渲染，而是“VCPToolBox 镜像文件 + OpenClaw session 补全”拼出来的只读会话视图。
