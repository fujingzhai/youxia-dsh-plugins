# dsh-agents-cli

在 DSH 主面板中使用本机 CLI Agents：默认 **Claude Code、Codex、Antigravity、Pi**，自动识别已安装入口，切换面板不中断终端。名称、指令、颜色和顺序均可自定义。

进程复用 DSH 官方 `subprocess.spawnTerminal`，画面使用内嵌 xterm.js。不附带 shell、CLI 程序或另一套 PTY 后端。

## 安装

需要 DSH **0.2.2-rc.1** 或更新版本，并在本机安装要使用的 CLI。打开 **插件 → 添加插件**，优先填 npm 包名：

```text
dsh-agents-cli
```

命令行（各系统相同；Web 版将 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add dsh-agents-cli
```

仅需固定 Git 版本时使用下面地址；Git 安装不显示原生 npm 更新入口：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-agents-cli@0.1.5&path:/dsh-agents-cli
```

### 检查更新

DSH 0.2.2-rc.1 已支持 npm 插件原生更新：打开「插件」点「刷新」，或进本插件详情的「版本 → 重新检查」；发现兼容新版后点击「更新到 <版本>」并确认，无需手动卸载重装。只在打开详情／刷新列表时检查，不是全局推送，不自动升级。**先完成正在运行的 CLI 任务**：Host 热更新可能卸下旧插件、结束终端，保留设置不等于保留活进程。设置文件留在 DSH 数据目录，不在包内；按结果提示刷新／重启。Git、压缩包和 `link:` 不适用，先保留定制与数据，勿贸然卸载；详见[仓库更新说明](../README.md#检查更新与原地升级)。

安装后重启 DSH，左侧出现 **Agents**。插件不安装 CLI、不接管登录，也不提供安装按钮。

## 用法

- 四个默认入口依次为 Claude Code／Codex／Antigravity／Pi，对应指令 `claude`／`codex`／`agy`／`pi`，配色为橙／蓝／绿／红。**这些是可编辑的默认值，不是写死的程序路径**；Antigravity 用户若使用其他启动命令，可在设置里修改 `agy`。
- 在用户的 shell 环境中检测指令，支持 PATH、函数和别名；顶栏只显示已检测到且启用的入口。每约 30 秒、回到窗口及打开设置时更新检测，安装后的 CLI 会自动出现。检测失败或复杂自定义命令无法可靠识别时，不武断隐藏。
- 不进入左侧 Agents，不做周期检测、不启动任何 CLI。首次进入只启动排序后的**第一个可用入口**，其他入口点到才启动；已打开的入口切走、收起侧栏或离开面板仍保持进程和输入状态，后台输出继续接收。DSH 重启或插件卸载后重新按需启动。
- 未启动的入口显示灰点，实际启动后才恢复对应颜色。CLI 退出后小点变灰，保留输出；再次点击该入口才重启。普通切换和网络重连不重复执行指令。
- 展开侧栏时，**Agents 文字右侧**显示与 DSH 会话列表同款的工作转圈／未读完成绿点；正在工作优先，回到对应终端查看后才清除它的完成提醒。等待操作为橙点，错误为红点。折叠窄栏不把状态盖在左侧图标上。
- 任务状态与进程存活分开：支持 OSC 7501、终端进度及原生标题状态。裸默认命令 `codex` 添加会话级标题／通知选项，`pi` 加载随包状态扩展，`agy` 使用会话级 title 回调，均不写全局配置。自定义命令保持原样；未提供可识别信号时不猜测工作或完成，尤其不靠输出静默计时。
- 右上角只保留设置。默认入口和自定义入口都可编辑名称、指令、颜色、顺序。指令更改对下次启动生效，不打断现有进程。
- 「移除」会停用入口并结束对应终端，设置中保留灰色条目及其原配置，可单独「恢复」。未安装／未检测到的入口使用不同的虚线状态标记，仍可编辑、排序；没有统一的「补回」按钮。
- 启动目录留空使用 DSH 官方 `workingDirectory.defaultDirectory`，设置里显示实际路径。手填无效目录会报错；更改仅影响下次启动。命令或 shell 函数若自行 `cd`，以其自身逻辑为准；本插件不随聊天会话切换目录。
- 终端只跟随 DSH 的主题和字体，不改全局偏好。底部仅保留 6 px 内边距，加上不足一行的自然余量，避免自定义 CLI 状态栏贴边或裁切。
- 为固定的 xterm.js 6.0.0 增加局部输入兼容修复，针对中文全角标点直接提交丢首字／重复发送，以及输入法非组合状态下被 `keyCode=229` 遮蔽的 Ctrl 组合键和 Esc。正在选字时仍由输入法处理，不修改聊天输入框或 Ghostty。已通过真实 xterm 的合成事件测试，**尚不能保证所有真实输入法都已解决**；旧终端可能需要重新加载新版客户端，勿为此中断正在工作的会话。

设置保存在 `<DSH_HOME 或 ~/.dsh>/dsh-agents-cli/settings.json`，不保存终端对话内容。早期本地版本的手动 Pi 保留原 ID，默认 Agy 名称升级为 Antigravity，自定义名称和排序不覆盖。

## 平台与验证

- **macOS**：已用 DSH 0.2.2-rc.1 官方终端服务和浏览器验证持久会话、编辑／停用／恢复、检测、底部留白；隔离 profile 验证右侧状态位置、后台完成、逐入口已读、侧栏折叠及 Codex／Antigravity／Pi 的真实短任务状态。真实 xterm 已验证中文标点／组合输入与 Ctrl+C／Esc 的合成事件；实际 macOS 输入法操作待人工复测。
- **Windows**：复用 DSH 官方 ConPTY 服务，支持 cmd、PowerShell 及 Git Bash 风格启动；cmd 调用 npm 的 `.cmd` 启动器使用 `call`，确保退出检测生效。GitHub Actions 在 Windows 实际执行 cmd／PowerShell 的启动和完成标记测试；完整 DSH Windows GUI 尚未实测。PowerShell 若限制 npm `.ps1`，将入口指令改为相应的 `.cmd`，无需插件修改系统执行策略。
- **Linux**：提供登录 shell 启动和非执行式检测，由 GitHub Actions 跑回归测试；完整 DSH GUI 尚未实测。
- 命令权限等同当前用户，不走 Agent 沙箱。Windows PowerShell profile、macOS／Linux shell 配置中的代理与登录态由用户维护。
- 检测只查询命令是否可解析，不运行 `--version` 或启动 CLI。Windows 安装器若更改系统 PATH，正在运行的 DSH 可能需要重启才能继承新 PATH。
- 部分 CLI 缓存启动时颜色，运行中换主题后自绘区域可能不会立即更新；插件不会为此重启会话。

## 性能与开发

只启动点击过的入口；页面卸载不重建终端。PATH 和 CLI 检测异步执行、合并缓存；输入按顺序批量发送并安全分片；尺寸更新按帧去重；SSE 慢连接缓冲设上限。

```sh
npm install --ignore-scripts --package-lock=false
npm run build
npm test
```

客户端构建产物随包提交，安装不需要构建。开发依赖不进入发布包；`@xterm/xterm` 与 `@xterm/addon-fit` 的 MIT 声明见 [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES)。
