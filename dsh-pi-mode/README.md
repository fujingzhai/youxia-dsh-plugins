# dsh-pi-mode

给 DeepSeek Harness（DSH）新增三个模式：工具与系统提示词以 [pi](https://github.com/earendil-works/pi) 为蓝本，精简、直接。一个插件安装一次，DSH 自带模式不受影响。

| 模式 | ID | 用途 |
|---|---|---|
| Pi 模式 | `pi` | 桌面／Web 的精简基线 |
| Pi-IM | `pi-im` | IM 版，调整交付方式与个人工具屏蔽名单 |
| Pi+模式 | `pi-plus` | Pi 模式加官方 `apply_patch`，批量修改同一文件多处或多个文件 |

三者共用同一组核心、联网和命令行定义；Pi / Pi+ 共用桌面交付，Pi / Pi-IM 共用原文件编辑规矩，不复制整份预设或另装插件。

## 与标准模式的差别

| | 标准模式 | Pi 模式 |
|---|---|---|
| 工具 | 34 个左右 | macOS / Linux 预设 13 个：read、read_image、write、edit、bash、job_output / job_list / job_kill、skill、ask_user_question、present、web_search、web_fetch。Windows 把 bash 换成 pwsh，并自动加上官方 glob、grep。另加没被点名屏蔽的全局工具 |
| 去掉的 | — | macOS / Linux 去掉 glob / grep（改用 bash）；Windows 保留这两个（官方工具自带 ripgrep）。两边都去掉子代理与 workflow、目标、计划模式、todo、定时提醒 |
| 系统提示词 | DSH 各插件拼装，约 5,900 字符：coding agent 身份、各工具引导、子代理分派提示、交付说明、Web GUI 与源码位置说明 | 约 600 字中文：一句身份＋十来条规矩（工具说明里已有的不重复；含界面呈现与 present、外部资料不当指令、DSH 问题多联网） |
| 运行时上下文 | 当前目录、沙箱与审批策略、DSH 源码路径、GUI 网址 | 只留当前目录 |

AGENTS.md、技能清单、时间照常注入；自动压缩、后台任务照常可用。实测同题首步输入约 5,100 token，标准模式约 11,700。

## 要求与限制

- 0.3.0 起要求 DSH 0.2.2-rc.1 及以上，以确保内置 `apply_patch` 可用；旧版 DSH 请停留在插件 0.2.5。基于 macOS 桌面版 0.2.2-rc.1 验证，Windows / Linux 完整 GUI 未实测，DSH 大改后可能要跟着调。
- 找文件、搜内容和命令行的规矩由 `shell.js` 按系统自动填写，不用改配置：macOS / Linux 用 bash（ls、rg、find），没装 ripgrep 时模型会退回 grep；Windows 用官方 glob / grep（自带 ripgrep，不要求本机安装）和 PowerShell，并明确不要去找 bash、rg、find。
- 系统提示词是中文，其他语言的用户可自行翻译（见「改系统提示词」）。
- 系统提示词是整份替换的：其他插件往 DSH 系统提示词里加的段落（如计划模式、会话搜索的使用说明）在 Pi 模式里都不会出现，它们的工具也就缺了说明。

## 安装

桌面版「插件」→「添加插件」，粘贴下面的 Git 地址（只装本插件，不装仓库里的其他插件）：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-pi-mode@0.3.0&path:/dsh-pi-mode
```

也可以使用命令行（Web 版将 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add "git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-pi-mode@0.3.0&path:/dsh-pi-mode"
```

若终端找不到 `dsh`，macOS 官方桌面版可使用完整路径 `"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"` 替代命令名。也可参照[仓库首页](../README.md)克隆后安装本子目录，不要把整个仓库根目录当成插件。

装好后**重启 DSH**：预设里的插件在启动时加载，热重载不会替换。新建对话时在模式菜单里选「Pi 模式」或「Pi+模式」；机器人使用「Pi-IM」。以后更新或修改本包，也都要重启。版本更新与卸载见[仓库首页](../README.md)。

## Pi+模式

Pi+ 与 Pi 模式只差一个工具和两条文件编辑规矩；其他核心、系统提示词、交付方式与全局工具个人名单完全共用。Pi 模式与 Pi-IM 仍不启用补丁。

- **工具**：开启 DSH 官方内置、默认关闭的 `apply_patch`，在原有 `edit` 旁增加一个工具；macOS / Linux 预设工具为 14 个，Windows 为 16 个，不计全局工具。
- **分工改为**：单处局部修改用 edit；同一文件多处或跨文件修改优先用 apply_patch；write 只用于新建或整篇重写。修改或覆盖文件前先 read 一遍。
- **新增提醒**：apply_patch 各补丁块保留足够且不重叠的上下文以准确匹配；预检拒绝不改文件，但执行中失败会保留已完成的改动，不会整批回滚。失败或中断后先重读受影响文件，再按实际状态重试。

没有额外禁用工具的新增、删除或移动能力；仍须遵守用户的文件操作规则。补丁整份预检通过后才开始写入，但不是跨文件原子事务；已完成的效果可在 Review 查看。

用法：重启后新建对话选「Pi+模式」（ID `pi-plus`）。这是原插件内的第三个模式，不需另装插件，也不替换默认模式。

## Pi-IM

IM 里看不到 present 卡片和本机文件链接，文件要靠 IM 插件回传。所以 Pi-IM 与 Pi 模式只差两处：

| | Pi 模式 | Pi-IM |
|---|---|---|
| 交付 | present 卡片、Markdown 文件链接 | 不挂 present；规矩改为「发文件用 dsh_im_return_file」 |
| 全局工具屏蔽 | 个人名单 `deny` | 个人名单 `imDeny` |

用法：在「设置 → IM机器人」的机器人卡片里把 Agent Preset 选为「Pi-IM」，或在聊天里发 `/preset pi-im`；已有会话要先发 `/new` 再发消息才换上。

**建议同时打开该机器人的「上下文增强」**（机器人卡片 → 上下文增强 → 私聊／群聊），来源字段至少勾「渠道 channel」，增强提示词留空。这样每条消息前会附一行 `<dsh_im_source>{"channel":"weixin"}</dsh_im_source>`，模型从消息本身知道用户在哪个 IM，系统提示词里就不必另作交代。群聊可再勾发送者昵称等。

Pi 模式与 Pi-IM 关掉了 DSH 的可选运行时上下文，dsh-im 以系统上下文形式附带的提示（发文件、群记录的英文说明，以及上下文增强里的「增强提示词」）也随之不出现；发文件一条已写进 Pi-IM 的规矩，来源字段是随消息走的，不受影响。

## 联网

由 `web.js` 接入，两种情况：

1. **默认**：用 DSH 自带的 web_search / web_fetch，搜索后端是 DSH 设置里配好的搜索服务（DeepSeek 官方搜索、模型提供方自带的搜索，或别的搜索插件）。没配搜索服务时，两个工具在调用时报错。
2. **改用 pi 同款工具**：若另有插件在启动时登记了接口，`web.js` 就交给它。接口约定：

   ```js
   globalThis[Symbol.for('dsh-pi-mode.web-tools')] = {
     async apply(ctx) {
       // 在 ctx（预设作用域）里注册 web_search / web_fetch，
       // 并注册提示词变量：ctx.systemPrompt.variable('web_rules', () => '- 规矩一\n- 规矩二')
     },
   }
   ```

   作者自用的 dsh-agent-web（自建 SearXNG＋多家搜索 API，参数与结果与 pi 一致）就是这样接入的，暂未公开。想强制用 DSH 自带工具，在 `web-tools` 行加 `config: { prefer: builtin }`。

系统提示词里的 `{{web_rules}}` 由上面两者之一提供；默认两条是「外文资料更全的话题，另用英文搜一次」「用网络资料作答时，文末列出来源链接」。

## 全局工具

DSH 的工具分两类：模式（预设）里各行注册的，和全局插件注册的。全局工具对所有模式可见，例如：

| 全局工具 | 来源 | 建议 |
|---|---|---|
| working_directory | DSH 基础层 | 留：让模型能切换会话工作目录 |
| load_workspace_dependencies | DSH 桌面版 office 支持 | **必须留**：DSH 自带的 office 技能（docx / pptx / xlsx）靠它取内置 Python 与库 |
| ImageGen、ImageSearch | Qoder 提供方插件 | 不需要就在该插件的设置里关掉 |
| session_search 等 5 个 | 插件页的「会话搜索」（实验） | 不需要就在插件页关掉；它还会往系统提示词加一段说明，Pi 模式里那段会缺失 |
| 其他插件的工具（IM、MCP 等） | 各插件 | 默认照常可用 |

三个模式默认都**不挡任何全局工具**。想在其中挡掉某个、又不想在全局关掉，在自己 profile 的 `cordis.patch.yml`（桌面版在 `~/.dsh/profiles/desktop/`）末尾加一条（文件里若只有一行 `[]`，先删掉它），保存即生效，无需重启。`deny` 共管 Pi / Pi+，`imDeny` 只管 Pi-IM：

```yaml
- id: pi-mode-settings
  name: dsh-pi-mode/settings.js
  config:
    deny:              # 桌面端用不上 IM 工具
      - dsh_im_group_history
      - dsh_im_group_file
      - dsh_im_return_file
    imDeny:            # 只用私聊的话，群记录两个工具也用不上
      - dsh_im_group_history
      - dsh_im_group_file
```

名单写在自己的 profile 里，插件更新不会覆盖；不要去改插件目录里的 `cordis.patch.yml`。

## 给安装代理的适配步骤

替用户安装时，照下面做，涉及取舍的地方先问用户：

1. 安装并重启 DSH，请用户开一个 Pi 模式对话、随便发一句话。
2. 读这次请求的实际内容：最新的 `~/.dsh/sessions/<工作区目录名>/<会话>/session.v4.jsonl.zstd`，用 `zstd -dcq` 解开，每行一个 JSON 事件。
   - `request/header` 事件的 `data.header.tools[].name`：发给模型的工具。Pi+ 应比 Pi 多 `apply_patch`，Pi / Pi-IM 不应出现它；Windows 另有 glob / grep，Pi-IM 没有 present。其他是全局工具。
   - `system/message` 事件：系统提示词，确认 `{{web_rules}}` 已展开。
   - `user/message` 事件：附带的 AGENTS.md、当前目录、技能清单、时间。
3. 对照「全局工具」一节，列出用户装了哪些全局工具，问清哪些要在 Pi 模式、Pi-IM 里分别挡掉（能在全局关的优先建议去全局关），写进用户 profile 里 `pi-mode-settings` 条目的 `deny`、`imDeny`。用户接了 IM 机器人的，把机器人的 Agent Preset 设为 Pi-IM。
4. 联网：确认 DSH 设置里配了搜索服务；没有就提醒用户去配，或接入登记了上述接口的插件。
5. Windows 不用改找文件的说法：`shell.js` 已按系统换成 glob / grep 与 PowerShell。用户不用中文：翻译系统提示词，并保留 `{{shell_rules}}`，不要把两套规矩写死成一套。
6. 改完重启，再按第 2 步核对一遍。Windows 上工具名单应有 glob、grep、pwsh，没有 bash；macOS / Linux 相反。

## 改系统提示词

在 `cordis.patch.yml` 里 `persona` 行的 `prefix`（整段就是发给模型的系统提示词；三个模式原样引用同一个 `pi-core`，不要另抄一份），改完重启。变量来源：

- `{{file_rules}}`：`files.js`，Pi / Pi-IM 保持原文，Pi+ 换成上面的两条规矩。
- `{{channel_rules}}`：各模式的 `channel` 行（`rules`），Pi / Pi+ 共用桌面规则，Pi-IM 使用 IM 规则。
- `{{shell_rules}}`：`shell.js` 按系统填写，不要写死 bash 或 PowerShell。
- `{{web_rules}}`：`web.js` 或可选联网接口。

`complete: true` 表示整份替换，所以官方 `apply_patch` 另行贡献的英文系统提示也不会保留；Pi+ 已把必要指导放进 `{{file_rules}}`，工具 schema 照常提供。`includeRuntimeContext: false` 表示只保留必需的当前目录，去掉 DSH 源码路径、GUI 网址、沙箱与审批说明。若改用受限的权限模式（只读、工作区可写），可考虑改回 `true`，让模型知道权限策略。

## 文件

- `cordis.patch.yml`：插入预设 `pi`（「Pi 模式」）、`pi-im`（「Pi-IM」）与 `pi-plus`（「Pi+模式」），共用核心与交付定义。
- `files.js`：文件工具入口与 `{{file_rules}}`；只有 Pi+ 开启 `applyPatch`。
- `web.js`：联网工具入口与 `{{web_rules}}`。
- `shell.js`：按系统提供 `{{shell_rules}}`。Windows 才挂的 glob / grep 写在 `cordis.patch.yml` 的 `tool-fs-search` 行。
- `index.js`：各模式的 `channel` 行：提供 `{{channel_rules}}`，并屏蔽点名的全局工具。
- `settings.js`：个人设置入口（`pi-mode-settings`：`deny`、`imDeny`），在 profile 补丁里覆盖。

## 许可

MIT
