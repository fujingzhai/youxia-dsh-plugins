# dsh-session-cost

在 DeepSeek Harness（DSH）输入框下方的统计条里，显示当前会话按市面 token 价折算的**等值费用**。

- 按每次模型调用实际上报的 token 记账：未缓存输入、缓存读取、缓存写入、输出（含推理）分别计价，长上下文阶梯价按每次调用的提示规模判定。
- 换模型分段相加：`¥0.3862 + $0.0418 + ¥0.0951`；各币种分开，不做汇率换算。
- 子代理（含多层）计入总数：`¥137.04 (¥30.62)` 表示一共 ¥137.04，其中子代理 ¥30.62。换过模型时，子代理并进它被派出时所在的那一段（币种不同则并进最近的同币种段，没有就在末尾另加一项），括号外各段之和就是总数；括号里的 `+` 只分隔币种。
- 价格随插件分发：[prices.json](prices.json) 收当前中美主流在线模型（国产用人民币价，含 DeepSeek 峰闲时与节假日、限时价、长上下文阶梯）。表里没有的模型按 DSH 自带的 pi-ai 模型目录兜底；再没有就显示 `--`，提示缺价格，不按零计。
- 点击费用一项（和 DSH 自带的用时、用量两项一样）弹出明细：总数，以及主会话和每个子代理各自的费用与所用模型（提供商/模型 ID，括号里是价格表中的名称）。

> 这是按 token 刊例价算的**等值费用**，不是实际扣款；订阅、免费额度、折扣与真实账单不在范围内。

纯 JavaScript，零 npm 依赖，不改 DSH 本体。已在 macOS 版 DSH 0.2.1-rc.5 实测；其他平台未实测。

## 安装

桌面版「插件」→「添加插件」，粘贴：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-session-cost@0.4.0&path:/dsh-session-cost
```

或用命令行（Web 版将 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add "git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-session-cost@0.4.0&path:/dsh-session-cost"
```

若终端找不到 `dsh`，macOS 官方桌面版可用 `"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"` 替代命令名。也可参照[仓库首页](../README.md)克隆后安装本子目录。

安装后重启 DSH。有 token 用量的会话，会在统计条的用时、用量两项之后显示费用。版本更新与卸载见[仓库首页](../README.md)。

## 价格放在哪里

- 自带的 [prices.json](prices.json) 只收当前主流在线模型，随插件更新；来源与口径见 [PRICES.md](PRICES.md)。
- **出了新模型、或看到某段显示 `--`**：在价格表里加一条即可（写法见下文）。`--` 表示这个模型既不在价格表里，DSH 自带目录也没有它的价格。
- **要自己改价或加模型**：把 `prices.json` 复制到自己的目录，在 DSH profile 的 `cordis.patch.yml` 里指过去（文件里若只有一行 `[]`，先删掉它）；这份文件不会被插件更新覆盖，保存即生效：

  ```yaml
  - id: session-cost
    name: dsh-session-cost
    config:
      priceBook: /你的目录/prices.json
  ```

- 用克隆目录链接安装（`link:`）时，也可以直接改目录里的 `prices.json`；有通用价值的改动欢迎提 PR。

### 什么时候生效

| 改了什么 | 何时生效 | 要不要重启 |
|---|---|---|
| 价格表 | 保存后约 0.2 秒，历史调用按新价重算；正在看的会话在它下一次有新事件（模型或工具调用）时刷新显示，其他会话打开即为新价 | 不用 |
| profile 补丁里的插件配置 | DSH 约 2 秒后重新组合 | 不用 |
| 插件代码 | 下一次重新组合时换上：改一下补丁、在插件页开关一次插件，或重启 | 不必 |

金额在每次模型调用结束、拿到用量后更新，不在流式输出中途估算。价格表写坏或校验失败时保留上一份有效价格。每次加载结果（价格表条数、目录来源与版本、最近错误）写在 DSH 数据目录（默认 `~/.dsh`）下的 `plugins/session-cost/status.json`，排查用。

## 配置参考

### 价格表写法

```json
{
  "version": 2,
  "timeZone": "Asia/Shanghai",
  "models": [
    {
      "name": "DeepSeek-V4.1-Flash",
      "match": ["my-relay/deepseek-flash", "*/deepseek-v4.1-flash"],
      "rules": [
        { "name": "常规价格", "currency": "CNY", "input": 1, "cacheRead": 0.02, "cacheWrite": 0, "output": 4 }
      ]
    }
  ]
}
```

`match` 里写 Session 事件中的实际路由 `provider/model`，不是界面显示名称；原生每轮 Token 用量详情或本插件的明细里可查看。比较时不分大小写；`provider` 可写 `*` 表示任意服务商，`model` 可用 `*` 通配（如 `*/claude-opus-5-5*`）。精确路由优先于通配路由；通配之间按文件顺序。同一路由不能被两条模型重复声明。

价格默认按 **100 万 Token** 计，也可在规则里设 `unit`。

### 模型条目

| 字段 | 含义 |
|---|---|
| `name` | 显示名，可选 |
| `match` | 路由列表，至少一个 |
| `rules` | 有序价格规则，**从上到下首个命中生效** |
| `catalog` | 与 `rules` 二选一：借用 pi-ai 目录里某个模型的价格，如 `"google/gemini-3.1-pro-preview"`，用于名字对不上目录的路由 |
| `note` | 备注，不参与计算 |

### 价格规则

| 字段 | 含义 |
|---|---|
| `name` | 规则名称，费用明细中显示 |
| `currency` | 三位 ISO 币种，如 `CNY`、`USD` |
| `input` / `cacheRead` / `cacheWrite` / `output` | 未缓存输入、缓存读取、缓存写入、输出单价；输出已含推理 |
| `tiers` | 可选长上下文阶梯：`[{ "above": 272000, "input": 4, "output": 15, ... }]`，本次提示（输入＋缓存读写）超过 `above` 时整次调用改用该档；没写的单价沿用基础价 |
| `unit` | 可选，默认 `1000000` |
| `when` | 可选生效条件；省略则为兜底规则 |

只要某次调用实际用到了某个非零 Token 桶，就必须有对应单价，否则该次记为未定价。`0` 是有效的免费价格，与缺失不同。

### 分时、节假日与限时

```json
{
  "dateSets": { "cn-holidays": ["2026-10-01..2026-10-07"] },
  "models": [{
    "match": ["*/deepseek-flash"],
    "rules": [
      {
        "name": "工作日高峰", "currency": "CNY", "input": 2, "cacheRead": 0.04, "output": 8,
        "when": {
          "weekdays": [1, 2, 3, 4, 5],
          "excludeDates": ["@cn-holidays"],
          "intervals": [{ "start": "09:00", "end": "12:00" }, { "start": "14:00", "end": "18:00" }]
        }
      },
      { "name": "闲时", "currency": "CNY", "input": 1, "cacheRead": 0.02, "output": 4 }
    ]
  }]
}
```

| 条件 | 规则 |
|---|---|
| `timeZone` | IANA 时区；省略时继承价格表顶层 `timeZone` |
| `from` / `to` | 带 `Z` 或明确时区偏移的 ISO 时间；`from` 包含，`to` 不包含 |
| `dates` / `excludeDates` | 本地日期白名单／排除名单；元素可为 `YYYY-MM-DD`、`YYYY-MM-DD..YYYY-MM-DD` 或 `@集合名`（引用顶层 `dateSets`） |
| `weekdays` | ISO 星期，1 为周一，7 为周日 |
| `intervals` | 每日本地时间区间，开始包含、结束不包含；支持跨午夜 |

不同条件之间是 AND，多个 `intervals` 之间是 OR。跨午夜时段的日期条件归属于**时段开始日**。

价格优先按实际请求前最后一条 `request/context` 或 `request/header` 事件的时间匹配；若没有这些事件，则用步骤／重试的开始时间。相同路由与上下文的后续请求可能省略前两类事件，此时跨越价格边界的少量调用只能采用步骤开始时间，属于日志信息所允许的近似口径。

### 兜底与其他配置

价格按以下顺序查找，先找到的为准：

1. 价格表 `prices.json`（或 `priceBook` 指定的文件）；
2. `catalog.sources` 里指定的 pi-ai 安装（可选，比如本机 pi 自带的更新版目录）；
3. DSH 自带的 pi-ai 模型目录（美元刊例价；DSH 附带的版本通常较旧，缺新模型）；
4. 都没有：显示 `--`。

插件配置写在 DSH profile 的 `cordis.patch.yml`（文件里若只有一行 `[]`，先删掉它），都可省略：

```yaml
- id: session-cost
  name: dsh-session-cost
  config:
    priceBook: /你的目录/prices.json   # 自己维护的价格表
    catalog:
      sources:                         # 额外的 pi-ai 目录，先列的优先
        - /path/to/pi-ai
      # includeHost: false             # 不用 DSH 自带目录兜底
      # enabled: false                 # 只用价格表
      # providers: [...]               # 查哪些厂商目录，默认 OpenAI/Codex、Anthropic、Google、xAI、Mistral、Copilot
      # hints: { codex: [openai-codex, openai] }   # DSH 服务商 → 先查哪个目录
    addReasoningToOutput: [antigravity]   # 输出不含推理的服务商，推理按输出计费
```

兜底时模型 ID 按小写比对，并兼容 `厂商/模型` 前缀、`-thinking` 后缀和 Claude 版本号的点／横线写法。目录价一律视为 USD；国产厂商的目录不参与（应以人民币价写进价格表）。

## 账目与显示口径

- Host 投影回放完整持久 Session 日志，历史分页和上下文压缩不会改变既有账目。
- 同一次尝试的最终用量替换其流式样本，避免重复计费。
- `llm/retry-started` 后的新尝试单独计入；如果提供方上报了失败或重试尝试的用量，也会计入费用。
- 连续相同 `provider/model` 合并为一个显示段；路由变化另起一段。
- 每段保留自己的币种。一个 Session 不会把不同币种换算后相加。
- 若一段中只有部分调用未定价，会显示“已知金额 + --”，提示该段账目不完整。
- 提供方尚未上报有效用量时不产生费用；响应结束后收到用量即更新，不自行按字符数估算流式费用。
- 子代理在各自的子 Session 里记账；父 Session 的统计条再把全部后代（子代理的子代理也算）计入底栏总数，括号里注明其中子代理的部分。运行中的子代理实时更新；没打开过的冷子 Session 由界面读取一次后显示，读取前显示 `(…)`。外部子代理没有本地日志，不计入。
- 分叉（对话分支、fork 子代理）开头复制的父 Session 历史不再计入新 Session，因为那部分已经在父 Session 里算过；否则父 Session 汇总子代理时会重复计费。DSH 原生 Token 统计会把这段继承历史算进去，两者在分叉 Session 上会不一致。
- Session 标题生成那次小调用没有用量记录，不计入。

只算标准文本 Token 刊例价（含长上下文阶梯价）。图片／音频附加费、搜索或工具调用费、批量折扣、Anthropic 1 小时缓存写入加价、提供方最低扣费单位等未计入。

## 开发

```sh
npm test            # 本目录的单元测试
npm run check       # 在合集根目录：清单、文档、语法、测试与打包检查
```

```text
index.js            Host 入口：加载价格与目录、注册 sessionCost 投影
client.js           统计条里的费用项与明细框
lib/projection.js   逐次调用的账本（只存日志事实，金额在出视图时按当前价格算）
lib/pricing.js      价格表校验、路由匹配、时段与阶梯计价
lib/catalog.js      兜底：读取 pi-ai 模型目录
lib/config.js       插件配置校验
lib/reload.js       价格表监听与热更新
```

Host 用 `sessionProjections` 注册 `sessionCost` 投影；Client 注册 `conversation.composer.dock` 的 `cost` 项，沿 DSH 自带的 `subagentCatalog` 投影遍历后代会话，经 `sessions.refreshProjections()` 读取未加载的子会话。

## 许可

MIT
