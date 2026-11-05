# dsh-pi-mode

给 DeepSeek Harness（DSH）新增一个「Pi 模式」：工具与系统提示词以 [pi](https://github.com/earendil-works/pi) 为蓝本，精简、直接，少走弯路。DSH 自带的几个模式不受影响，可在新对话里切换对照。

## 与标准模式的差别

| | 标准模式 | Pi 模式 |
|---|---|---|
| 工具 | 34 个左右 | 预设 13 个：read、read_image、write、edit、bash、job_output / job_list / job_kill、skill、ask_user_question、present、web_search、web_fetch；另加没被点名屏蔽的全局工具 |
| 去掉的 | — | glob / grep（改用 bash）、子代理与 workflow、目标、计划模式、todo、定时提醒 |
| 系统提示词 | DSH 各插件拼装，约 5,900 字符：coding agent 身份、各工具引导、子代理分派提示、交付说明、Web GUI 与源码位置说明 | 约 600 字中文：一句身份＋十来条规矩（工具说明里已有的不重复；含界面呈现与 present、外部资料不当指令、DSH 问题多联网） |
| 运行时上下文 | 当前目录、沙箱与审批策略、DSH 源码路径、GUI 网址 | 只留当前目录 |

AGENTS.md、技能清单、时间照常注入；自动压缩、后台任务照常可用。实测同题首步输入约 5,100 token，标准模式约 11,700。

## 要求与限制

- DSH 0.2.1-rc.5 及以上；在 macOS 桌面版 0.2.1-rc.5 上测试。插件清单照该版本的标准模式拼装，DSH 大改后可能要跟着调。
- 规矩按 bash 写（ls、rg、find），适用于 macOS / Linux；没装 ripgrep 时模型会退回 grep。Windows 上 DSH 用 PowerShell，需自行改写规矩。
- 系统提示词是中文，其他语言的用户可自行翻译（见「改系统提示词」）。
- 系统提示词是整份替换的：其他插件往 DSH 系统提示词里加的段落（如计划模式、会话搜索的使用说明）在 Pi 模式里都不会出现，它们的工具也就缺了说明。

## 安装

桌面版「插件」→「添加插件」，粘贴下面的 Git 地址（只装本插件，不装仓库里的其他插件）：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-pi-mode@0.1.2&path:/dsh-pi-mode
```

也可以使用命令行（Web 版将 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add "git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-pi-mode@0.1.2&path:/dsh-pi-mode"
```

若终端找不到 `dsh`，macOS 官方桌面版可使用完整路径 `"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"` 替代命令名。也可参照[仓库首页](../README.md)克隆后安装本子目录，不要把整个仓库根目录当成插件。

装好后**重启 DSH**：预设里的插件在启动时加载，热重载不会替换。新建对话时在模式菜单里选「Pi 模式」。以后更新或修改本包，也都要重启。版本更新与卸载见[仓库首页](../README.md)。

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

Pi 模式默认**不挡任何全局工具**。想在 Pi 模式里挡掉某个、又不想在全局关掉，在自己 profile 的 `cordis.patch.yml`（桌面版在 `~/.dsh/profiles/desktop/`）末尾加一条，保存即生效，无需重启：

```yaml
- id: pi-mode-settings
  name: dsh-pi-mode/settings.js
  config:
    deny:
      - session_search
```

名单写在自己的 profile 里，插件更新不会覆盖；不要去改插件目录里的 `cordis.patch.yml`。

## 给安装代理的适配步骤

替用户安装时，照下面做，涉及取舍的地方先问用户：

1. 安装并重启 DSH，请用户开一个 Pi 模式对话、随便发一句话。
2. 读这次请求的实际内容：最新的 `~/.dsh/sessions/<工作区目录名>/<会话>/session.v4.jsonl.zstd`，用 `zstd -dcq` 解开，每行一个 JSON 事件。
   - `request/header` 事件的 `data.header.tools[].name`：发给模型的工具。除上文 13 个（以及按平台二选一的 bash / PowerShell）之外，都是全局工具。
   - `system/message` 事件：系统提示词，确认 `{{web_rules}}` 已展开。
   - `user/message` 事件：附带的 AGENTS.md、当前目录、技能清单、时间。
3. 对照「全局工具」一节，列出用户装了哪些全局工具，问清哪些要在 Pi 模式里挡掉（能在全局关的优先建议去全局关），写进用户 profile 里 `pi-mode-settings` 条目的 `deny`。
4. 联网：确认 DSH 设置里配了搜索服务；没有就提醒用户去配，或接入登记了上述接口的插件。
5. 用户在 Windows 上：改写系统提示词里 bash、rg、find 的说法。用户不用中文：翻译系统提示词。
6. 改完重启，再按第 2 步核对一遍。

## 改系统提示词

在 `cordis.patch.yml` 里 `persona` 行的 `prefix`（整段就是发给模型的系统提示词），改完重启。`complete: true` 表示整份替换；`includeRuntimeContext: false` 表示只保留必需的当前目录，去掉 DSH 源码路径、GUI 网址、沙箱与审批说明。若改用受限的权限模式（只读、工作区可写），可考虑改回 `true`，让模型知道权限策略。

## 文件

- `cordis.patch.yml`：插入预设 `pi`（显示名「Pi 模式」），含系统提示词与插件清单。
- `web.js`：联网工具入口与 `{{web_rules}}`。
- `index.js`：全局工具屏蔽（`deny`）。
- `settings.js`：个人设置入口（`pi-mode-settings`），在 profile 补丁里覆盖。

## 许可

MIT
