# youxia-dsh-plugins

[![检查](https://github.com/fujingzhai/youxia-dsh-plugins/actions/workflows/check.yml/badge.svg)](https://github.com/fujingzhai/youxia-dsh-plugins/actions/workflows/check.yml)

自用并持续维护的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件合集。

| 插件 | 当前版本 | 作用 |
|---|---|---|
| [dsh-pi-mode](dsh-pi-mode) | 0.1.1 | 以 Pi 为蓝本，精简工具与系统提示词 |
| [dsh-zh-slash](dsh-zh-slash) | 0.1.0 | 用「、」唤出原生 `/` 命令菜单 |
| [dsh-session-cost](dsh-session-cost) | 0.4.0 | 统计条显示会话（含子代理）按市面 token 价折算的费用 |

兼容要求与使用说明见各插件目录。

## 安装

### 桌面 GUI（推荐）

打开 **插件 → 添加插件**，按需粘贴其中一条。地址包含版本标签及子目录，**不要只填仓库首页地址**：

**顿号触发：**

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-zh-slash@0.1.0&path:/dsh-zh-slash
```

**Pi 模式：**

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-pi-mode@0.1.1&path:/dsh-pi-mode
```

**会话费用：**

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-session-cost@0.4.0&path:/dsh-session-cost
```

安装后重启 DSH。Pi 模式需新建会话并在模式菜单中选择；顿号触发无需选模式，在已选工作区的会话输入框开头敲「、」即可；会话费用在有 token 用量的会话统计条里自动出现。

### 命令行

```sh
# 各条互相独立，按需执行；Web 版将 desktop 换成 web
dsh plugin --profile desktop add "git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-zh-slash@0.1.0&path:/dsh-zh-slash"
dsh plugin --profile desktop add "git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-pi-mode@0.1.1&path:/dsh-pi-mode"
dsh plugin --profile desktop add "git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-session-cost@0.4.0&path:/dsh-session-cost"
```

若终端找不到 `dsh`，macOS 官方桌面版可把命令名替换成带引号的完整路径：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add "git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-zh-slash@0.1.0&path:/dsh-zh-slash"
```

其他平台使用自己的 DSH 命令位置，不要照抄 macOS 路径。

### 克隆后安装（需自行定制时）

```sh
git clone https://github.com/fujingzhai/youxia-dsh-plugins.git
cd youxia-dsh-plugins
dsh plugin --profile desktop add "link:$PWD/dsh-zh-slash"
# 或：dsh plugin --profile desktop add "link:$PWD/dsh-pi-mode"
# 或：dsh plugin --profile desktop add "link:$PWD/dsh-session-cost"
```

链接安装依赖本地目录，请勿移走或删除目录。Pi 模式的个性化提示词、工具屏蔽名单应留在自己的副本，不要覆盖公共默认值；会话费用的自定义价格表放在插件目录之外，用配置 `priceBook` 指过去（见其 README）。

## 更新与卸载

- **版本安装**：查看 [Releases](https://github.com/fujingzhai/youxia-dsh-plugins/releases)，在插件页更新来源到新版地址，或重新执行该版本的安装命令。版本标签固定，不会自动跟随 `main`。
- **跟随开发版**：将地址里的 `#<插件名>@<版本>`（如 `#dsh-session-cost@0.4.0`）换成 `#main`。这是滚动版本；需要最新提交时重新安装，不能保证 DSH 自动更新分支引用。
- **本地链接**：先保存自己的改动，再在克隆目录执行 `git pull --ff-only`；有冲突先合并，不要强制重置。
- **卸载**：在插件页卸载对应插件；也可执行 `dsh plugin --profile desktop remove <插件名>`，如 `dsh-zh-slash`。
- 每次安装、更新、卸载后重启 DSH；插件各自独立，卸载一个不影响其他。

## 维护与反馈

- [变更记录](CHANGELOG.md) · [维护约定](CONTRIBUTING.md) · [问题反馈](https://github.com/fujingzhai/youxia-dsh-plugins/issues)
- 各插件独立版本、独立标签：`<插件名>@<版本>`。不会为新增插件强制升级其他插件。
- 根目录执行 `npm run check`：校验清单、入口、安装文档、语法、测试及打包内容。检查无需额外 npm 依赖；GitHub Actions 在 Linux、macOS、Windows 运行 Node 24 检查。这不等于各平台已做过完整 DSH GUI 实测。
- 报错时请提供 DSH 版本、操作系统、插件版本、安装来源及复现步骤；不要上传账号密钥、完整会话日志或私人配置。

## 许可

MIT
