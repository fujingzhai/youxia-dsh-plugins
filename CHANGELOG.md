# 变更记录

各插件独立版本，Git 标签采用 `<插件名>@<版本>`。未说明的插件不随其他插件升级。

## 2026-11-06

### dsh-pi-mode 0.2.3

- 修复 0.2.2 新增 `exports` 时漏掉 `./web.js` 与 `./settings.js` 两个子路径：Pi 模式的联网行与个人设置行无法启动，新建会话报 `agent-preset/invalid: web-tools (dsh-pi-mode/web.js): never started`，已有 Pi 会话显示「会话不可用」、标题退回 session-ID。已发布的 0.2.2 包同样受影响，请升级。
- `node --check` 与 11 项回归测试通过。

### dsh-pi-mode 0.2.2

### dsh-settings-customizer 0.3.1

### dsh-zh-slash 0.1.1

## 2026-11-05

### dsh-session-cost 0.4.2

- 修复漏算：上下文压缩的摘要那次模型调用（`compaction/summary`）也按提供方上报的用量计入费用。此前只算 `assistant/message`，压缩多的会话会少算（一处实测 4 次摘要合计少 2.7%）。计价时间取压缩开始（`compaction/start`），路由取摘要事件自带的 `provider/model`；缺 `compaction/start` 时退回事件时间与当前路由。
- 投影状态版本升到 6，旧检查点自动重放日志；不含自定义价格表等个人配置。回归测试 43 项通过。

### dsh-settings-customizer 0.3.0

- 首个公开版（原本地插件名 `dsh-settings-order`）。以个人 DSH profile 配置覆盖设置导航的顺序、名称、图标，不修改其他插件源码；未配置时不改变界面。
- 公共代码默认空规则，实际配置留在仓库外的 Host profile；支持 DSH 原生 live 配置同步、内置图标与数据式 SVG、清除规则和卸载恢复。发布包不含作者实际规则。
- 新增依赖 `@deepseek-ai/schemastery ~3.19.0`，最低 DSH 版本为 0.2.2-rc.1。25 项回归测试通过，并在 macOS DSH 0.2.2-rc.1 的隔离 Web profile 实测空默认、名称／顺序／图标覆盖、配置热更新和清除恢复；其他系统未做 GUI 实测。

### dsh-speed-pair 0.1.0

- 收录。把底栏输出速度改成双口径 `207(122) tok/s`：括号外是首 token 之后的纯解码速度（DSH 原口径），括号内是请求发出→收完的整段速度（含首字延迟，即 pi 底栏口径）。两个数出自同一份 `sessionStats` 投影的同一批输出 token，只换分母；点击弹出轮/步、模型用时、工具调用用时、TTFT 平均、生成用时与两个速度。
- 顶替自带的「会话统计」项：用 `:has()` 条件隐藏，插件未载入时自带读数照旧显示；始终显示轮/步（DSH 未把「性能与用量」偏好开放给第三方插件），`SHOW_COUNTS` 可关。

### dsh-pi-mode 0.2.1

- Pi-IM 的系统提示词不再交代「用户通过即时通讯和你对话」，只留 `dsh_im_return_file` 的用法；渠道改由 dsh-im「上下文增强」逐条消息附带（README 补了建议设置）。

### dsh-session-cost 0.4.1

- 明细弹框精简：标题改为「Tokens 成本（按市价）」，去掉底部说明；主会话与每个子代理各列一次费用和所用模型（提供商/模型 ID（名称）），不再重复列合计与调用次数。

### dsh-pi-mode 0.2.0

- 新增 IM 版预设「Pi-IM」（`pi-im`），给 dsh-im 接入的 IM 机器人用：不挂 present，交付规矩改为 IM 回传，IM 工具照常可用。与 Pi 模式共用 `pi-core` 一组定义，改 Pi 模式时自动跟上。
- 系统提示词里随渠道变化的两条规矩改由各模式的 `channel` 行以 `{{channel_rules}}` 提供；个人设置新增 `imDeny`（Pi-IM 的屏蔽名单）。
- 修复 DSH 0.2.2-rc.1 中设置全局工具屏蔽名单后，对话在提示词组装阶段报 `reading 'filter'`；改用工具限制接口，名单与工具注册变动仍即时生效。
- 修复 DSH 0.2.2-rc.1 中未接替代联网插件时 Pi 模式建不了对话（自带联网工具新增必填项 `searchSummaryMaxChars`）；改为由自带工具的配置定义补默认值。
- 已在 macOS 桌面版 0.2.2-rc.1 实测两个模式的工具与系统提示词。

### dsh-pi-mode 0.1.2

- 新增个人设置入口 `pi-mode-settings`：工具屏蔽名单写在自己 profile 的 `cordis.patch.yml` 里，保存即生效、插件更新不覆盖；公共默认仍不屏蔽任何工具。

### dsh-session-cost 0.4.0

- 收录。在统计条显示当前会话按市面 token 价折算的等值费用：换模型分段相加，各币种分开；子代理（含多层）计入总数，括号里注明其中子代理的部分；点击弹出明细。
- 自带价格表只收当前中美主流在线模型（国产人民币价含 DeepSeek 峰闲时与节假日；美国模型美元价含长上下文阶梯）；表里没有的按 DSH 自带 pi-ai 目录兜底，再没有显示 `--`，新模型可自行加入。
- 价格表保存即生效；自定义价格表可放在插件目录之外，用 `priceBook` 指定。
- 纯 JavaScript、零 npm 依赖，不改 DSH 本体；已在 macOS 版 DSH 0.2.1-rc.5 实测，其他平台未实测。

### dsh-zh-slash 0.1.0

- 输入开头的「、」触发 DSH 原生斜杠菜单。
- 支持整段上屏与粘贴，IME 组合期间不改写；正文中的顿号保持原样。
- 纯客户端、零 npm 运行依赖，无账号或本机绝对路径要求。
- 已测 DSH 0.2.1-rc.5 的同款 Web GUI；其他平台真实输入法尚未逐一验证。

### dsh-pi-mode 0.1.1

- 修复合集中的安装示例：正确安装 `dsh-pi-mode` 子目录，不再误指整个仓库。
- 补充 GitHub 固定版本来源、仓库元信息、Node 版本要求及独立回归测试。
- 去掉妨碍公开索引发现的 `private` 标记；仍只从 GitHub 分发，不发布到 npm。
- 工具与提示词运行逻辑不变；公共版本不带作者本机的 IM 工具屏蔽名单。

### 合集维护

- 收录 dsh-session-cost；首页插件表与各安装清单统一按插件名排序；维护约定补充价格表的发版要求。
- 新增插件索引、GUI／命令行安装说明、更新卸载方式及维护约定。
- 新增无依赖的全仓检查和 Linux／macOS／Windows GitHub Actions。

## 既有版本

### dsh-pi-mode 0.1.0

新增 Pi 模式，精简预设工具与系统提示词，默认不屏蔽全局工具。
