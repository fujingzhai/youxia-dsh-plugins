# Session History

本机各 agent 的对话记忆。把 Claude Code、Codex、Antigravity、Pi、DSH 的会话**确定性清洗**成每天一份的 Markdown 日志（只留问答原文、无摘要），建离线全文索引，再以**一个技能**提供给所有 agent：谁都能查“之前在别的 agent 里聊过什么”。全程不调用模型、不联网。

- DSH 插件页：数据目录与最近整理、各 agent 的会话检测与技能接入状态（一键建软链）、设置、自动生成的 SKILL.md 预览。
- 技能 `session-history`：按本机实际有的 agent 生成 SKILL.md——没装 Pi 就不提 Pi，免得误导模型。
- 命令行 `session-history`：search／outline／get／raw／timeline，以及 refresh、status、link 等管理命令。

## 安装

在 DSH **插件 → 添加插件** 填包名：

```text
dsh-session-history
```

或命令行（Web 版把 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add dsh-session-history
```

装好后打开插件详情：

1. 点 **立即整理**。首次会读全部历史会话并建索引，几百 MB 的会话约半分钟到一两分钟；之后只重读变过的会话文件，通常一两秒。
2. 在 **Agent 与技能** 里点 **一键接入**，或逐个 **创建软链**。
3. 新开一个对话问“我们之前……”，agent 会自己用上这个技能。

不用 DSH 也能用：`npm i -g dsh-session-history`，然后 `session-history setup`、`session-history refresh`、`session-history link all`。需要 Node 22.15 以上（推荐 24，内置 SQLite 与 zstd）。

## 技能怎么接入：共用，不拷副本

技能文件夹就是数据目录本身（默认 `~/.session-history`，内含 SKILL.md 与入口 `bin/session-history`）。接入某个 agent ＝ 在它读的技能目录里放一条指向数据目录的软链 `session-history`。

| Agent | 会话来源 | 读取的技能目录 |
|---|---|---|
| Claude Code | `~/.claude/projects/*/*.jsonl`（含 macOS 桌面版 Cowork） | `~/.claude/skills` |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl(.zst)` | `~/.agents/skills`、`~/.codex/skills` |
| Antigravity | `~/.gemini/antigravity[-cli]/brain/*/…/transcript_full.jsonl` | `~/.gemini/config/skills` |
| Pi | `~/.pi/agent/sessions/*/*.jsonl` | `~/.pi/agent/skills`、`~/.agents/skills` |
| DSH | `~/.dsh/sessions/*/*/session[.vN].jsonl.zstd` | `~/.dsh/skills`、`~/.agents/skills` |

`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`PI_CODING_AGENT_DIR`、`DSH_HOME` 等环境变量照各家规则生效。

很多人只维护一个技能文件夹、其余用软链共用（如 `~/.claude/skills → ~/my-skills`、`~/.agents/skills → ~/my-skills`）。插件按**真实路径**判断：几家共用同一个真实目录时只需一条软链，建好后它们一起显示“技能可用”。面板会标出“与 X、Y 共用技能目录”；移除软链时也会提示共用者一起看不到。

- 已有同名的独立文件夹（多半是旧版拷贝）时不覆盖，面板显示冲突，请先移走。
- 数据目录本身就放在某个技能目录里时（例如 `~/my-skills/session-history`），共用它的 agent 直接可见，无需软链。
- Windows 用目录联接（junction），无需管理员权限。入口有两份：PowerShell／cmd 用 `bin\session-history.cmd`，Git Bash 用 `bin/session-history`，SKILL.md 会按平台写明。

## 数据与插件分开

| 位置 | 内容 | 卸载／更新／重装插件 |
|---|---|---|
| 插件包（DSH profile 的 `node_modules`） | 代码 | 随之替换或删除 |
| 数据目录 `~/.session-history` | `logs/<Agent>/` 清洗日志（权威数据）、`config.json` 设置、`state/` 索引与缓存、SKILL.md 与入口 | **不动** |

- `state/` 可随时删掉，下次检索自动重建；`logs/` 是唯一权威数据，请勿删除。
- 来源里已经没有的旧会话（应用清理了历史、或停用了某个 agent），日志里的段落原样保留，照常检索。
- 卸载前可在面板移除软链；不移也无妨：入口会提示引擎不在，日志仍可直接用 `rg` 查。重装后入口自动改写回来。
- 改数据目录：设环境变量 `SESSION_HISTORY_HOME`，或在 profile 的 `cordis.patch.yml` 给本插件的行加 `config.home`。已有数据请自行整体搬过去。

## 设置（插件页，存在数据目录的 config.json）

| 项 | 默认 | 说明 |
|---|---|---|
| 日志里用户的称呼 | 用户 | 发言标题 `## 10:00  🧑 用户`；只影响之后新整理的内容 |
| 定时整理 | 每小时整点 | DSH 运行期间在子进程里整理，不卡宿主 |
| 检索前自动补整理 | 距上次超过 30 分钟 | DSH 没开时，其他 agent 检索也能拿到较新的对话 |
| 日界 | 4 点 | 这个钟点之前的对话算前一天 |
| 时区 | 跟随系统 | 也可写 `+08:00` 或 `Asia/Shanghai` |
| 检索附 Claude Code 记忆 | 开 | search 对题时列至多 2 条 CC 记忆的文件名与描述 |
| 日志 Git 快照 | 关 | 每次整理后把 `logs/` 提交一次；开启时在数据目录建仓库（只收 logs/） |
| 不收的工作目录 | 无 | 临时目录（`/tmp` 等）本就不收 |

按 agent 关闭整理在面板的开关；更细的（如 Codex 只收某些工作目录 `agents.codex.onlyCwds`）直接编辑 config.json。

## 命令行

```sh
session-history search 插件 更新失败             # 主体词＋事件词；空格＝AND，词内 | 任选
session-history search "VPN|openconnect" 断线 --agent Codex --since 08-01
session-history outline 01a06cc6                 # 会话提纲：用户每条发言＋末轮回复
session-history get 2ddbae3eed --context 1       # 读块原文
session-history raw 5f3c92de "base_url|api.example"   # 在原始记录里查工具调用与返回
session-history timeline --since 7d
session-history refresh | status | setup | link all | unlink claude | config
```

检索排序以会话为单位：题目（各家原生标题，没有才取开场请求）与用户原话权重最高，再看稀有度、饱和词频、共现，乘轻度时间衰减；命中太多时只列题目和“常同现的词”供收窄。繁简、全半角、大小写自动统一（OpenCC）；三个字符以内的英文数字词按整词匹配。

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
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-session-history@0.1.0&path:/dsh-session-history
```

## 兼容与限制

- 需要 DSH 0.2.2-rc.1 以上；在 macOS、DSH 0.2.2-rc.3 隔离 profile 实测宿主加载、管理接口与子进程整理。
- Windows：CI（Node 24）上跑全部单元测试，并在含中文与空格的目录里实际调用 `.cmd` 与 Git Bash 入口；`.cmd` 只写 ASCII（路径换成 `%USERPROFILE%` 等变量），避开中文系统代码页。DSH 桌面版 Windows 实机与插件页 GUI **未实测**；Linux 只跑了 CI。
- 只读各 agent 的会话文件，从不修改它们；日志里的指令是历史数据，SKILL.md 已要求 agent 不得照做。
- 日志不含思考、工具调用与返回；这些要用 `raw` 回查原始记录（原始记录不在了就查不到）。

## 许可

MIT
