# Session History

让每个 agent 都能查到你在各个 agent 里聊过什么。

## 用法与思路

### 现在的 agent 记忆缺什么

- **各记各的。** 每个 agent 把对话存在自己的目录里，格式互不相通。今天在一个 agent 里定下的方案，明天换一个接着做，它一概不知。
- **只留摘要。** 自带的“记忆”多是模型挑着记下的几条要点：记什么、怎么概括由模型决定，原话、细节和来龙去脉都会丢，记错了也很难发现。
- **换了就没了。** 记忆只在自家可用，换一个 agent，之前积累的都用不上。

### 本插件的做法：留原文，按需查

1. **整理。** 定时把各家的会话清洗成按天存放的 Markdown 日志：只去掉系统提示、工具调用这类机械内容，你和助手说的话一字不改。整理由程序完成，不调用模型，结果每次都一样。
2. **检索。** 为日志建本地全文索引。agent 需要回忆时，先用关键词找到相关的会话，再按需读原文；每次读多少有上限，不会一下子塞满上下文。
3. **共用。** 整理结果以一个技能（`session-history`）提供给所有 agent。在任何一个 agent 里，都能查到其他 agent 里的对话。

用的时候什么都不用做：你提到“之前”“上次”或 agent 不清楚来由的事，它会自己去查，并在回答里注明出处（日期、会话、行号）。

### 为什么不做 RAG

很多记忆方案会把对话切块、做向量嵌入，再按语义相似度召回。这里刻意不这样做：

- **要找的多是确切的东西。** 一个命令、一个参数、某天定下的决定——关键词能精确命中；语义相似度擅长“意思差不多”，在这类字符串上恰恰最不可靠。
- **嵌入要用模型。** 放在电脑上占资源，放到云端就得把全部对话发出去。
- **结果可以核对。** 每条结果都能回到原文；不会把“看起来相关”的片段混进来，让模型误以为是事实。
- **没有维护负担。** 不用管嵌入模型的版本，不用重新嵌入；日志就是普通文本，不装这个插件也能直接搜。
- **模型本来就会搜。** 现在的模型会自己挑关键词、换同义词、逐步缩小范围；检索只要做到快、准、输出可控，其余交给模型。

## 功能

- **多家 agent**：Claude Code、Codex、Antigravity、Pi、DSH、OpenCode、LobsterAI，以及 WorkBuddy（实验性）。装好就自动检测，后装的也会自动出现。会话格式与其中某一家相同的其他 agent，或同一 agent 的第二套配置，可以「自动查找」或手动添加。
- **检索以会话为单位**：会话标题和你的原话权重最高；命中太多时只列标题，并提示可以加哪些词收窄。繁简、全半角、大小写自动统一。
- **原始记录兜底**：命令、参数、报错原文多藏在工具调用里，可以在单个会话的原始记录中定点查找。
- **Claude Code 记忆提示**：检索时顺带列出对题的 Claude Code 记忆（整理过的结论），可先读这些。
- **技能说明自适应**：SKILL.md 只写你电脑上实际有的 agent，不让模型去查不存在的东西。
- **数据独立**：日志、索引与设置存在 `~/.session-history`，与插件分开；卸载、更新、重装都不受影响。
- **全程离线**：不调用模型，不联网。

## 安装与上手

在 DSH **插件 → 添加插件** 填包名：

```text
dsh-session-history
```

或命令行（Web 版把 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add dsh-session-history
```

装好后打开插件详情：

1. 启用后约 20 秒会自动做第一次整理，也可以点 **立即整理**。首次要读全部历史会话，几百 MB 约需半分钟到一两分钟；之后只重读有变化的会话，通常一两秒。
2. 在 **技能接入** 里点 **建软链**（或 **全部接入**），让各 agent 能用上本技能。几家共用一个技能文件夹时只需点一次。
3. 新开一个对话，问一句“我们之前……”试试。

不用 DSH 也能用：`npm i -g dsh-session-history`，再运行 `session-history setup`、`session-history refresh`、`session-history link all`。需要 Node 22.15 以上（推荐 24）。

## 插件页

- **数据目录**：位置、最近整理时间、会话与日志数量、整理是否出错；可打开目录或立即整理。
- **Agents**：只列检测到的 agent（以及你添加的），每次打开都会重新检测。每家显示会话来源与数量、是否收录、技能状态（已接入／待接入／冲突／不接入）。关掉「收录」只是不再整理它的新会话，已有日志照常检索。
- **技能接入**：只有检测到、但还没接入的 agent 才需要操作。按它们实际读取的文件夹归组，一组一个按钮，写明点了之后哪些 agent 生效；已建的软链列在这里，可以移除。
- **自动查找／手动添加**：见下节。
- **另有旧日志**：数据目录里有、但对应 agent 已不在的日志（比如卸载了某个 agent）。新装的用户一般没有这一行。
- **设置**：整理频率、检索前是否补整理、日志里你的发言标题、日界、时区、不收录的目录、Claude Code 记忆提示、Git 快照。
- **SKILL.md**：各 agent 实际读到的技能说明，可展开查看。

### 添加其他 agent

用于本插件未内置、但会话记录格式与某一家相同的 agent，或同一 agent 的另一套配置目录（多开、多账号）。

**自动查找** 会重新检测内置的 agent，并在几处已知位置（如 Qoder CLI、CodeBuddy Code）和家目录第一层的同名变体配置目录（如 `~/.claude-work`）里找能收录的会话，找到的一键添加；不会深入扫描你的文件。找不到的再 **手动添加**，要填：

| 项 | 填什么 |
|---|---|
| 名称 | 日志里助手的名字，也是检索时 `--agent` 用的名字 |
| 会话格式 | 它的会话记录与哪一家相同 |
| 会话目录 | 存放会话记录的那一层目录，按格式而定（见下表） |
| 技能目录（可选） | 它读取技能的文件夹；填了才能接入技能，留空只收录会话 |

| 会话格式 | 会话目录选哪一层 | 例子 |
|---|---|---|
| Claude Code | `projects`（里面是 `<项目>/<会话>.jsonl`） | Qoder CLI 的 `~/.qoder-cn/projects` |
| Codex | `sessions`（里面是 `<年>/<月>/<日>/rollout-*.jsonl`） | 另一个 `CODEX_HOME` 下的 `sessions` |
| Pi | `sessions`（里面是 `<目录>/<会话>.jsonl`） | 另一个 Pi 配置目录下的 `sessions` |
| DSH | `sessions`（里面是 `<目录>/<会话>/session.vN.jsonl.zstd`） | 另一个 `DSH_HOME` 下的 `sessions` |
| OpenCode | `opencode`（里面是 `opencode.db`） | 另一个 `XDG_DATA_HOME` 下的 `opencode` |
| Antigravity | `brain`（里面是 `<会话>/.system_generated/logs/…`） | 第二个实例的 `antigravity-cli/brain` |
| LobsterAI（OpenClaw） | `agents`（里面是 `<agent>/sessions/<会话>.jsonl`） | 其他基于 OpenClaw 的客户端 |
| WorkBuddy（CodeBuddy） | `projects`（里面是 `<项目>/<会话>.jsonl`） | CodeBuddy Code 的 `~/.codebuddy/projects` |

填好后点 **检查目录**，会告诉你按所选格式找到几个会话文件；找不到多半是层级或格式选错了。

## 技能接入是怎么回事

数据目录本身就是技能文件夹（里面有 SKILL.md 和入口 `bin/session-history`）。让某个 agent 用上它，只要在它读取的技能目录里放一条指向数据目录的软链 `session-history`，不拷副本，所以永远只有一份。

| Agent | 读取的技能目录 |
|---|---|
| Claude Code | `~/.claude/skills` |
| Codex | `~/.agents/skills`、`~/.codex/skills` |
| Antigravity | `~/.gemini/config/skills`（命令行）、`~/.gemini/antigravity/skills`（桌面版） |
| Pi | `~/.pi/agent/skills`、`~/.agents/skills` |
| DSH | `~/.dsh/skills`、`~/.agents/skills` |
| OpenCode | `~/.config/opencode/skills`、`~/.claude/skills`、`~/.agents/skills` |
| LobsterAI | 应用数据目录下的 `LobsterAI/SKILLs`（可能还需在它的技能设置里启用） |
| WorkBuddy | `~/.workbuddy/skills` |

很多人只维护一个技能文件夹，其余目录用软链指向它（例如 `~/.claude/skills`、`~/.agents/skills` 都指向 `~/my-skills`）。这时各 agent 读的其实是同一个文件夹，但本技能的文件夹（数据目录）不在里面，所以显示「待接入」是准确的：只需在那个共用文件夹里建一条 `session-history` 软链，它们就一起接入。

判断是否已接入，是从每个 agent 自己的技能目录出发、顺着软链去读 `session-history/SKILL.md`，读得到、名字对才算，与 agent 加载技能走同一条路。已有同名的独立文件夹（多半是旧版拷贝）时不会覆盖，会提示冲突。Windows 用目录联接，不需要管理员权限。

## 数据与卸载

| 位置 | 内容 | 卸载／更新／重装插件 |
|---|---|---|
| 插件包（DSH profile 的 `node_modules`） | 代码 | 随之替换或删除 |
| `~/.session-history` | `logs/<Agent>/` 日志（唯一的权威数据）、`config.json` 设置、`state/` 索引与缓存、SKILL.md 与入口 | 不动 |

- `state/` 可以随时删除，下次检索自动重建；`logs/` 请勿删除。
- 某个 agent 清理了自己的历史、或者被卸载，已整理的日志照样保留、照常检索。
- 卸载前可以在面板移除软链；不移也无妨，入口会提示引擎已不在，日志仍可直接用 `rg` 等工具搜索。重装后入口自动恢复。
- 改数据目录：设环境变量 `SESSION_HISTORY_HOME`，或在 profile 的 `cordis.patch.yml` 给本插件的行加 `config.home`；已有数据请整体搬过去。

## 命令行

```sh
session-history search 插件 更新失败             # 主体词＋事件词；空格＝同时出现，词内 | 表示任选
session-history search "VPN|openconnect" 断线 --agent Codex --since 08-01
session-history outline 01a06cc6                 # 会话提纲：你的每条发言＋末轮回复
session-history get 2ddbae3eed --context 1       # 读原文
session-history raw 5f3c92de "base_url|api.example"   # 在原始记录里查工具调用与返回
session-history timeline --since 7d
session-history refresh | status | setup | link all | unlink claude | config
```

## 更新

### 检查更新

适用于从 npm 安装的 DSH 0.2.2-rc.1 及以上：

1. 打开 **插件**，点 **刷新**；有新版时卡片标记 **可更新**。也可在插件详情 **版本 → 重新检查**。
2. 点页头 **更新到 <版本>**，核对版本与安装源后确认。**无需手动卸载重装**；数据目录不受影响。
3. 更新后插件会自动改写技能入口；如提示需要重启，按提示重启 DSH。

这是打开详情或刷新列表时的检查，不是全局推送，也不自动升级。固定 Git 标签、压缩包或 `link:` 安装不显示这套更新入口。

### 固定版本

Git 子目录地址（不提供原生更新检查）：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-session-history@0.2.1&path:/dsh-session-history
```

## 兼容与限制

- 需要 DSH 0.2.2-rc.1 以上；macOS 上在 DSH 0.2.2-rc.3 实测。
- Windows：PowerShell／cmd 用 `bin\session-history.cmd`，Git Bash 用 `bin/session-history`，SKILL.md 会按平台写明；CI 在 Windows 上实际调用两种入口。Windows 版 DSH 的插件页尚未实测，Linux 只跑了 CI。
- WorkBuddy 的会话格式按其内核 CodeBuddy Code 的公开代码推断，尚未用真实会话验证，所以标为实验性。
- 只读取各 agent 的会话文件，从不修改它们。日志里的指令是历史数据，SKILL.md 已要求 agent 不得照做。
- 日志不含思考过程与工具调用；这些要用 `raw` 回查原始记录，原始记录不在了就查不到。OpenCode 的原始记录存在数据库里，暂不支持 `raw`。

## 许可

MIT
