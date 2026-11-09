# dsh-zh-slash

**中文输入法下，在 DSH 输入框开头敲「、」，直接弹出原生 `/` 命令菜单。**

- `、` → `/`：显示 DSH 原生命令与技能菜单。
- `、模型`、`、model`：继续使用 DSH 原有的中文／英文筛选。
- 菜单的方向键、Tab、回车、鼠标选择及参数面板完全沿用原生行为。
- 正文中间的顿号不改写；输入法组合期间不干预，待最终上屏才处理。
- 不新增中文别名，不重新汉化，不复制 Pi 的终端编辑器。

## 安装

桌面版「插件」→「添加插件」，优先填 npm 包名：

```text
dsh-zh-slash
```

命令行（Web 版将 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add dsh-zh-slash
```

仅需固定 Git 版本时使用下面地址；Git 安装不显示原生 npm 更新入口：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-zh-slash@0.1.1&path:/dsh-zh-slash
```

### 检查更新

DSH 0.2.2-rc.1 已支持 npm 插件原生更新：打开「插件」点「刷新」，或进本插件详情的「版本 → 重新检查」；发现兼容新版后点击「更新到 <版本>」并确认，无需手动卸载重装。只在打开详情／刷新列表时检查，不是全局推送，不自动升级。本插件无独立数据文件；按结果提示刷新／重启。Git、压缩包和 `link:` 不适用，先保留定制与数据，勿贸然卸载；详见[仓库更新说明](../README.md#检查更新与原地升级)。

若终端找不到 `dsh`，macOS 官方桌面版可用 `"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"` 替代命令名。也可参照[仓库首页](../README.md)克隆后安装本子目录。

正常安装会自动启用组合包。刷新桌面窗口；若新插件还未载入，重开 DSH。开一个已选工作区的会话，在空输入框中敲「、」确认菜单出现。版本更新与卸载见[仓库首页](../README.md)。

## 实现与边界

纯客户端插件，通过 DSH 的 `conversation.input.overlay` 扩展槽挂载，用公开的 `inputActions.captureInsertion()`／`insertText()` 对当前修订做局部改写。只把输入开头的顿号转换为 slash，后续交给 DSH 自己的输入触发管线；没有修改 App、接管编辑器或注册模型工具。

优先在 `beforeinput` 中转换；粘贴及 IME 整段提交通过输入状态变更兜底。保留后续正文、光标位置和引用芯片。正文中间的顿号与多行后续位置不触发。输入开头的顿号默认视为命令入口，不提供首字符字面顿号的专门转义。

要求 DSH `0.2.1-rc.5` 及以上，并启用原生会话界面。无账号、密钥、绝对路径或额外 npm 运行依赖；桌面端与 Web 端共用同一套实现，和 Pi 模式可分别安装、独立使用。

已在 macOS 桌面版同款 DSH `0.2.1-rc.5` Web 客户端验证：原生 `/` 与顿号菜单一致、中文／英文筛选、Tab 打开原生面板、粘贴、Chromium IME 组合／提交。其他操作系统及真实输入法仍需用户试敲；DSH 处于预览期，升级后若输入 API 变动可能需要适配。

## 开发

```sh
npm run check
npm test
```

零 npm 运行依赖。卸载插件后恢复 DSH 原生输入行为。
