# VCP OpenClaw Bridge

本地 OpenClaw 插件包，负责两件事：

- 把 `VCPToolBox` 的工具与记忆检索暴露成 OpenClaw 可调用工具
- 把 `Feishu/Lark` 会话镜像写回 `VCPToolBox/ChannelMirrorData`，供 `VCPChat` 浏览

## Install

```powershell
openclaw plugins install E:\2026\VCPChat\OpenClawmodules\vcp-openclaw-bridge
```

## Config

在 OpenClaw 配置中加入：

```json
{
  "plugins": {
    "entries": {
      "vcp-openclaw-bridge": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:6005/v1/integrations/openclaw",
          "token": "same-as-OPENCLAW_VCP_SHARED_TOKEN",
          "mirrorChannel": "feishu",
          "enableMirror": true,
          "enableTools": true
        }
      }
    }
  }
}
```
