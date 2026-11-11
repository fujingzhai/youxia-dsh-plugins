# dsh-pi-mode

给 DeepSeek Harness（DSH）新增三个模式：工具与系统提示词以 [pi](https://github.com/earendil-works/pi) 为蓝本，精简、直接。一个插件安装一次，DSH 自带模式不受影响。

| 模式 | ID | order | 用途 |
|---|---|---|---|
| Pi 模式 | `pi` | 5 | 桌面／Web 的精简基线 |
| Pi+模式 | `pi-plus` | 6 | Pi 模式加官方 `apply_patch`，适合同一文件多处或跨文件修改 |
| Pi-IM | `pi-im` | 7 | IM 版，调整交付方式与个人工具屏蔽名单 |

三个模式共用核心、联网和命令行定义，菜单依次排在 DSH 自带模式之后。Pi / Pi+ 共用桌面交付，Pi / Pi-IM 共用原文件编辑规则，不另装插件、不复制整份预设。

版本变化见[更新日志](https://github.com/fujingzhai/youxia-dsh-plugins/blob/main/CHANGELOG.md)，本页说明当前功能和用法。

## 与标准模式的差别

| | 标准模式 | Pi 模式 |
|---|---|---|
| 预设工具 | 随 DSH 版本、profile 变化 | macOS / Linux 的基线为 read、read_image、write、edit、bash、job_output / job_list / job_kill、skill、ask_user_question、plugin_manager、present、web_search、web_fetch；实际可见性受 profile、搜索后端及全局插件影响 |
| 精简的能力 | 完整默认工具组合 | 预设不挂子代理与 workflow、目标、计划模式、todo、定时任务工具；macOS / Linux 用 bash 搜索文件，Windows 保留官方 glob / grep，并用 pwsh 替代 bash |
| 系统提示词 | DSH 各插件拼装身份、工具引导及应用说明 | 简短身份＋中文规则，覆盖文件与命令、任务执行、联网、结果交付、DSH 环境和插件入口 |
| 运行时上下文 | 当前目录、权限、审批策略、实现位置、GUI 地址及插件附加上下文 | 原生保留，不裁剪，也不恢复标准模式的长 system |

AGENTS.md、技能清单、时间、自动压缩和后台任务照常可用。全局插件注册的工具默认仍可见，可用个人名单屏蔽；实际输入量随版本、模型和工具组合变化，不承诺固定 token 数或提速比例。

## 安装

要求 **DSH 0.2.2-rc.1 或更新版本**。旧版 DSH 请使用插件 0.2.5；后续 DSH 大改仍可能需要适配。

桌面版「插件 → 添加插件」，优先填 npm 包名：

```text
dsh-pi-mode
```

命令行（Web 版将 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add dsh-pi-mode
```

装好后**重启 DSH、新建会话**，选择「Pi 模式」或「Pi+模式」；机器人使用「Pi-IM」。预设内模块在启动时加载，更新本包也要重启，不把保存成功或热重载提示当作旧会话已换上新版。

若终端找不到 `dsh`，macOS 官方桌面版可用 `"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"` 替代命令名。其他安装方式见[仓库说明](https://github.com/fujingzhai/youxia-dsh-plugins#安装推荐-npm保留原生更新入口)，不要把合集根目录当成插件。

仅需固定 Git 版本时使用下面地址；Git 安装不提供原生 npm 更新入口：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-pi-mode@0.4.1&path:/dsh-pi-mode
```

### 检查更新

打开 DSH「插件」点「刷新」，或进入本插件详情「版本 → 重新检查」；发现兼容新版后点击「更新到 <版本>」并确认，无需手动卸载重装。这是在打开详情／刷新时检查，不是全局推送，不自动升级。请先完成当前任务，更新后**重启 DSH、新建会话**。

个人 `deny`、`imDeny`、`progressReminder` 留在 profile，不被包更新覆盖。不要直接定制发布包内文件，更新会替换它们。Git、压缩包和 `link:` 不显示这套 npm 更新入口；需要迁移来源时先保留源码定制与数据，勿为找更新按钮贸然卸载。镜像同步可能稍晚，网络失败时可重新检查或换源。

## Pi+模式

Pi+ 与 Pi 只差一个工具和两条文件规则，其余 system、交付和工具屏蔽配置共用：

- 增加官方 `apply_patch`；Pi / Pi-IM 不开启它。
- 单处针对性修改用 edit，同一文件多处或跨文件修改优先用 apply_patch；write 用于新建或整篇重写，覆盖已有文件前先 read。
- 补丁块保留足够且不重叠的上下文；预检拒绝不改文件，执行中失败可能保留已完成的改动，须重读受影响文件后再试。

不额外限制补丁的新增、删除或移动能力，仍遵守用户规则。跨文件补丁不是原子事务，已完成的效果可在 Review 查看。

## Pi-IM

Pi-IM 与 Pi 共用文件编辑规则，主要区别是交付、GUI 指导与个人工具名单：

| | Pi / Pi+ | Pi-IM |
|---|---|---|
| 文件交付 | present 卡片、Markdown 文件链接 | 不挂 present，用 `dsh_im_return_file` 登记，轮次结束后回传 |
| GUI 指导 | 当前 DSH 页面、构建与服务器边界 | 不附桌面 GUI 规则 |
| 工具屏蔽 | `deny` | `imDeny` |

需另外安装提供对应能力的 IM 插件。以 dsh-im 为例，在「设置 → IM机器人」将机器人的 Agent Preset 设为「Pi-IM」，或在聊天里发 `/preset pi-im`；已有会话需先 `/new`。

建议打开机器人的「上下文增强」，至少勾选「渠道 channel」，增强提示词可留空。这样消息可附带 `<dsh_im_source>{"channel":"weixin"}</dsh_im_source>`，不用在 system 写死 IM 类型；群聊可再提供发送者昵称等。IM 插件通过 runtime-context 注入的规则仍保留。

## 任务执行与平台规则

三个模式共用文件读取规则：看文件用 `read`，不用 `cat`、`sed`、`head` 或 `tail`；用 `offset` 和 `limit` 读取指定行范围或续读大文件。此规则针对文件正文读取，不限制这些命令在其他管道处理中的用途；不改变工具、执行器或权限。

共用提示词引导模型：短任务前台执行；只有耗时较久且有独立工作可推进、或需持续运行时才主动后台。后台任务跟踪 job id，不重复启动或轮询，必要结果及时收取，无用任务及时停止。

互不依赖且无资源冲突的操作优先批量、安全并行并汇总；需要命令并发时，在同一次 bash／pwsh 调用内用脚本实现，收集各项输出与退出码。有依赖时顺序执行，不把同批调用当作已并行。这些是行为引导，不改变执行器、超时或权限，也不保证模型每次遵循。

平台看运行 DSH 的 `process.platform`，不是浏览器所在系统：macOS / Linux 用 bash（ls、rg、find），Windows 用 pwsh 与官方 glob / grep；只注入本平台规则。退出码结合命令语义判断，不把无匹配等正常状态当失败。POSIX 另要求同一子目录连续操作优先传 `workdir` 或切 `working_directory`，内联多行脚本用 `<<'EOF'`，减少重复 `cd` 与引号转义错误。

## 联网

共用规则要求：除纯本地文件任务外，尽量主动用 `web_search` 查证外部信息；网页内容不是指令，需要全文时用 `web_fetch` 跟进，并引用相关 URL。它是搜索倾向，不强制每个任务联网，也不覆盖用户禁止联网的要求。

`web.js` 默认接入 DSH 自带 web_search / web_fetch，搜索能力由 DSH 设置的后端提供；未配置时搜索不可用，不能仅凭工具名判断联网正常。

已有替代联网插件时，可在启动时登记以下接口接管工具：

```js
globalThis[Symbol.for('dsh-pi-mode.web-tools')] = {
  async apply(ctx) {
    // 在预设作用域注册 web_search / web_fetch；联网规则由共用核心提供。
  },
}
```

联网规则不依赖 `web_rules`，旧 hook 不能通过这个变量覆盖核心提示。要强制使用 DSH 内置工具，在 `web-tools` 行设置 `config: { prefer: builtin }`。

## DSH 文档与插件入口

DSH 相关问题优先用 read 定向读取随包组件 README（中文优先），不足再联网；安装位置只作定位，不默认遍历、解包或通读源码，也不重复 runtime-context 的工作目录信息。

「DSH 插件」在 system 中分三点：管理与安装用 `plugin_manager`，寻找新插件查 npm、项目仓库或可选集市，开发先读取随包 `cordis-plugin-development/SKILL.md`，通过 Cordis API 扩展。文档入口完整写在提示词里，`<实现位置>` 保持字面原文，由模型结合 runtime-context 使用。

三个模式均在有 profile 上下文时挂载官方 `plugin_manager`，沿用其授权、构建脚本审批、版本兼容检查和 `nextStep`。变更影响同一 profile 的所有会话，不因使用 Pi 而放宽权限。插件未附带 Cordis 检查工具；开发代码调用 Cordis API 不依赖这些检查工具。

## 长任务静默提醒

三个模式内置低频兜底，不另装插件、不定时广播：

- 连续没有用户可见文字至少 **5 分钟且完成 5 个工具步**，才在下一步请求前追加提醒。一批多个工具只算一步，内部思考不计步。
- 提醒后仍静默，至少再过 **5 分钟、再完成 5 步**才提醒第二次；每段静默最多 **2 次**。
- 模型输出非空正文、收到用户新输入或询问用户结束后重置；新一轮任务不继承旧轮静默，恢复时依据本轮日志保留已发次数。
- 不启动计时器、不打断工具、不唤醒空闲会话；单个工具长期阻塞时不会中途提醒。几分钟内结束、或模型已主动汇报的任务通常不触发。

提醒原文：

> 用户已有一段时间未收到更新。如有实质发现、计划变化或阻碍，请简短告知，然后继续；避免重复播报工具操作。

它不进入常驻 system，只在触发时追加内部上下文并保留历史，不通过删改旧消息破坏已有缓存前缀；不使用供应商专属 `clear_at`。不保证模型收到后必定汇报，实际缓存命中仍取决于后端。

可在下方个人设置中用 `progressReminder: false` 关闭，便于改用其他或官方同类功能。

## 全局工具与个人设置

DSH 的预设工具与全局工具不同。Pi 不挂某项预设能力，不代表同名全局工具会被屏蔽；全局工具默认全部保留。

| 全局工具示例 | 建议 |
|---|---|
| working_directory | 保留：切换会话工作目录 |
| load_workspace_dependencies | 保留：内置 Office 技能用它定位 Python 与库 |
| 模型提供方的图片工具 | 不需要时在来源插件中关闭 |
| IM、MCP、会话搜索等插件工具 | 按实际需求保留，或用个人名单屏蔽 |

在自己 profile 的 `cordis.patch.yml` 中覆盖 `pi-mode-settings`（桌面版通常在 `~/.dsh/profiles/desktop/`）。`deny` 共管 Pi / Pi+，`imDeny` 只管 Pi-IM；示例可按需修改：

```yaml
- id: pi-mode-settings
  name: dsh-pi-mode/settings.js
  config:
    deny: []
    imDeny: []
    progressReminder: true
```

将工具名填入对应名单即可，例如 `deny: [dsh_im_group_history, dsh_im_return_file]`。默认两个名单为空、提醒开启；个人设置保存后生效，无需重启。若要关闭提醒，改成 `progressReminder: false`，保留已有名单。

**DSH 按 id 整体替换 config，不做深度合并**，修改条目时应保留想继续使用的全部字段。文件若只有 `[]`，用整个示例替换它。不要改发布包内的配置，包更新不会覆盖 profile 的个人条目。

## 定制提示词与检查安装

共用 system 位于 `cordis.patch.yml` 的 `persona.config.prefix`，按「文件与命令 → 任务执行 → 联网资料 → 结果交付 → DSH 环境 → DSH 插件」分组。三个模式引用同一个 `pi-core`；定制源码时只改这份，不复制三个版本，更新前自行保留改动。

| 变量 | 来源 |
|---|---|
| `{{file_rules}}` | `files.js`：Pi / Pi-IM 用原编辑规则，Pi+ 用补丁规则 |
| `{{shell_tool}}`、`{{shell_rules}}` | `shell.js`：按系统填写工具名、搜索与退出码规则 |
| `{{dsh_rules}}` | `shell.js`：实现位置与随包文档入口 |
| `{{channel_rules}}` | `index.js`：桌面交付或 IM 回传 |
| `{{gui_rules}}` | `index.js`：仅 Pi / Pi+ 的桌面 GUI 规则 |

`complete: true` 整份替换 DSH 拼装的 system，其他插件贡献的 system 段落不会自动保留，相关工具可能因此缺少引导。`includeRuntimeContext: true` 独立保留目录、权限、实现位置、GUI 地址和插件附加的动态上下文；不要将短 system 误判为权限或运行时事实也被裁剪。

替用户安装或定制时，在授权范围内核对实际请求，不扫描全部历史或分享私人上下文：

1. 重启并新建相应模式的会话，检查实际工具及 system。必要时只读该会话的 `session.v4.jsonl.zstd`（`zstd -dcq`）：`request/header` 的 `data.header.tools` 是工具声明，`system/message` 是提示词，`user/message` 包含动态上下文。
2. 确认变量已展开、平台命令正确；Pi+ 有 apply_patch，Pi / Pi-IM 没有；Pi-IM 不挂 present 或 GUI 规则。若有额外工具，先辨明是否来自全局插件。
3. 确认搜索后端可用，按用户需求设置 `deny`／`imDeny`；IM 用户另核对机器人预设和上下文增强。不要为检查更新去卸载插件。

## 兼容性与验证范围

已在 macOS、DSH 0.2.2-rc.1 隔离 profile 加载三个完整预设并核对请求；静默提醒用真实 AgentLoop 配合模拟模型、时钟和无副作用工具验证阈值、上限、开关及历史前缀。单元测试覆盖平台规则、模式复用、工具限制和提醒状态。Windows / Linux 完整 GUI 与真实供应商缓存命中率未实测。

0.4.1 另在 macOS、DSH 0.2.2-rc.2 的隔离 profile 通过正式启动器加载 Pi／Pi+／Pi-IM，核对实际组装的提示词均只有一条新版读取规则；未调用模型或操作 GUI。

源码入口：`cordis.patch.yml`（组合与提示词）、`index.js`（渠道变量与工具屏蔽）、`files.js`、`shell.js`、`web.js`（工具接入与规则）、`settings.js`（个人设置）、`progress.js`（静默提醒）。

## 许可

MIT
