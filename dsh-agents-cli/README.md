# dsh-agents-cli

在 DSH 主面板中使用本机 CLI Agents：默认 **Claude、Codex、Antigravity、Pi**，自动识别已安装入口，切换面板不中断终端。名称、指令、颜色和顺序均可自定义。

进程复用 DSH 官方 `subprocess.spawnTerminal`，画面使用内嵌 xterm.js。不附带 shell、CLI 程序或另一套 PTY 后端。

## 安装

需要 DSH **0.2.2-rc.1** 或更新版本，并在本机安装要使用的 CLI。打开 **插件 → 添加插件**，填入：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-agents-cli@0.1.3&path:/dsh-agents-cli
```

也可直接填 npm 包名：

```text
dsh-agents-cli
```

命令行（各系统相同；Web 版将 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add "git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-agents-cli@0.1.3&path:/dsh-agents-cli"
```

安装后重启 DSH，左侧出现 **Agents**。插件不安装 CLI、不接管登录，也不提供安装按钮。

## 用法

- 四个默认入口依次为 Claude／Codex／Antigravity／Pi，对应指令 `claude`／`codex`／`agy`／`pi`，配色为橙／蓝／绿／红。**这些是可编辑的默认值，不是写死的程序路径**；Antigravity 用户若使用其他启动命令，可在设置里修改 `agy`。
- 在用户的 shell 环境中检测指令，支持 PATH、函数和别名；顶栏只显示已检测到且启用的入口。每约 30 秒、回到窗口及打开设置时更新检测，安装后的 CLI 会自动出现。检测失败或复杂自定义命令无法可靠识别时，不武断隐藏。
- 不进入左侧 Agents，不做周期检测、不启动任何 CLI。首次进入只启动排序后的**第一个可用入口**，其他入口点到才启动；已打开的入口切走、收起侧栏或离开面板仍保持进程和输入状态，后台输出继续接收。DSH 重启或插件卸载后重新按需启动。
- 未启动的入口显示灰点，实际启动后才恢复对应颜色。CLI 退出后小点变灰，保留输出；再次点击该入口才重启。普通切换和网络重连不重复执行指令。
- 右上角只保留设置。默认入口和自定义入口都可编辑名称、指令、颜色、顺序。指令更改对下次启动生效，不打断现有进程。
- 「移除」会停用入口并结束对应终端，设置中保留灰色条目及其原配置，可单独「恢复」。未安装／未检测到的入口使用不同的虚线状态标记，仍可编辑、排序；没有统一的「补回」按钮。
- 启动目录留空使用 DSH 官方 `workingDirectory.defaultDirectory`，设置里显示实际路径。手填无效目录会报错；更改仅影响下次启动。命令或 shell 函数若自行 `cd`，以其自身逻辑为准；本插件不随聊天会话切换目录。
- 终端只跟随 DSH 的主题和字体，不改全局偏好。底部预留空间，避免自定义 CLI 状态栏贴边或裁切。

设置保存在 `<DSH_HOME 或 ~/.dsh>/dsh-agents-cli/settings.json`，不保存终端对话内容。早期本地版本的手动 Pi 保留原 ID，默认 Agy 名称升级为 Antigravity，自定义名称和排序不覆盖。

## 平台与验证

- **macOS**：已用 DSH 0.2.2-rc.1 官方终端服务和浏览器验证持久会话、编辑／停用／恢复、检测、底部留白、Pi 与 Codex 交互。
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
