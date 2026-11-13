# 价格维护记录

核对日期：**2026-11-13**。口径：模型的**市面 token 刊例价**，不是订阅或额度的实际扣费。单位：每 100 万 token。

## 原则

- 只收**当前主流在线模型**；旧型号不收。新模型发布后手动加一条。
- 国产模型用 CNY，美国模型用 USD，不做换算。
- 表里没有的模型，按 DSH 自带的 pi-ai 模型目录兜底（美元刊例价）；DSH 0.2.1-rc.5 附带的是较旧的 pi-ai 1.1.0，缺 gpt-6.1-terra、gemini-4-argon、claude-haiku-5.5 等新型号，所以主流模型都直接写进本表。兜底也没有的显示 `--`。

## 国产模型（CNY）

数值按各厂商官方人民币刊例价核定（与 Pi 的模型配置交叉核对）。

| 模型 | 路由 | 输入 | 缓存读取 | 缓存写入 | 输出 |
|---|---|---:|---:|---:|---:|
| DeepSeek-V4.1-Flash 闲时 | Qoder `dfmodel`、任意 `deepseek-flash` / `deepseek-v4.1-flash` | 1 | 0.02 | 0 | 4 |
| DeepSeek-V4-Pro 闲时 | Qoder `dmodel`、任意 `deepseek-v4-pro` | 4.5 | 0.15 | 0 | 13.5 |
| Kimi-K3.1-Pro | Qoder `kmodel_latest`、任意 `kimi-k3.1-pro` | 13 | 1.3 | 13 | 68 |
| Kimi-K3 | 任意 `kimi-k3`、`kimi-k3-1` | 20 | 2 | 20 | 100 |
| Kimi-K2.8-Preview | Qoder `kmodel`、任意 `kimi-k2.8-preview` | 6.5 | 1.3 | 0 | 27 |
| GLM-5.3 | Qoder `gmodel`、任意 `glm-5.3` | 8 | 2 | 0 | 28 |
| GLM-5.3-Flash | Qoder `gfmodel`、任意 `glm-5.3-flash` | 0.8 | 0.23 | 0 | 2.8 |
| Qwen3.8-Max | Qoder `qmodel_38max`、任意 `qwen3.8-max` | 12 | 1.5 | 0 | 36 |
| Qwen3.8-Flash | Qoder `qfmodel`、任意 `qwen3.8-flash` | 1 | 0.1 | 0 | 3 |
| Qwen3.8-27B | 任意 `qwen3.8-27b` | 3 | 0.6 | 0 | 12 |
| MiniMax-M3.1-Flash | Qoder `mmodel`、任意 `minimax-m3.1-flash` | 1 | 0.1 | 0 | 4 |
| Step-5-Preview | Qoder `jmodel`、任意 `step-5-preview` | 7 | 0.35 | 7 | 20 |
| MiMo-V2.6-Pro | 任意 `mimo-v2.6-pro` | 3 | 0.025 | 0 | 6 |
| MiMo-V2.6-Flash | 任意 `mimo-v2.6-flash` | 1 | 0.02 | 0 | 2 |
| Hy4（腾讯混元 4） | 任意 `hy4-preview`、`hy4`、`hy4std` | 6 | 0.3 | 0 | 18 |

Qoder（经 [dsh-provider-qoder](https://www.npmjs.com/package/dsh-provider-qoder) 接入，中国区）内部代号与模型名的对应取自 Qoder 的模型目录接口。Qoder 的 Auto、Fast 是路由，没有市面价，不写。

## 分时与限时

- **DeepSeek 官方错峰**：北京时间周一至周五 9:00–12:00、14:00–18:00 为高峰，价格 ×2；周末、法定节假日全天为闲时；调休上班的周末仍算周末。按模型匹配、不分服务商，所以经 Qoder 或其他中转调用的 DeepSeek 也按此计。节假日表在 `dateSets.cn-holidays`，**目前只录到 2026 年**；2027 年安排发布后（往年在 11 月）补上。
- **Gemini 4 Carbon / Argon**：首发价 $2 / 缓存 $0.10 / $10 至 2026-11-30；2026-12-01 起标准价 $4 / $0.20 / $20。
- **Gemini 3.8 Flash**：首发价 $0.75 / 缓存 $0.075 / $3.75 至 2026-12-31；2027-01-01 起标准价 $1.50 / $0.15 / $7.50。
- **Gemini 4 Hydrogen**：输入 $1.50 / 缓存读取 $0.075 / 输出 $7.50；缓存写入在 2027-01-12 前为 $0，此后按 $1.875 计费。

## 美国模型（USD）

数值以 pi-ai 1.5.0 模型目录（2026-11-05，当时最新版）为基础，Gemini 按 Google Cloud 官方价格页、Grok 按 xAI 官方模型页核对。路由一律写 `*/模型ID`，Claude 同时兼容点号写法（如 `claude-opus-5.5`）与带后缀的变体。

| 模型 | 输入 | 缓存读取 | 缓存写入 | 输出 | 长上下文 |
|---|---:|---:|---:|---:|---|
| GPT-6 Astra | 10 | 1 | 12.5 | 50 | >272K：20 / 2 / 25 / 75 |
| GPT-6.1 Sol | 2 | 0.1 | 2.5 | 10 | >272K：4 / 0.2 / 5 / 15 |
| GPT-6.1 Terra | 1 | 0.05 | 1.25 | 5 | >272K：2 / 0.1 / 2.5 / 7.5 |
| GPT-6 Luna | 0.1 | 0.01 | 0.125 | 0.5 | >272K：0.2 / 0.02 / 0.25 / 0.75 |
| Claude Fable 5.1 | 10 | 0.25 | 12.5 | 50 | — |
| Claude Opus 5.5 | 4 | 0.2 | 5 | 20 | — |
| Claude Sonnet 5.5 | 2 | 0.1 | 2.5 | 10 | — |
| Claude Haiku 5.5 | 0.1 | 0.01 | 0.125 | 0.5 | >100K：0.5 / 0.05 / 0.625 / 2.5 |
| Gemini 4 Hydrogen | 1.5 | 0.075 | 0（2027-01-12 起 1.875） | 7.5 | — |
| Gemini 4 Carbon | 2（12-01 起 4） | 0.1（0.2） | 0 | 10（20） | — |
| Gemini 4 Argon | 2（12-01 起 4） | 0.1（0.2） | 0 | 10（20） | — |
| Gemini 3.8 Flash | 0.75（2027-01-01 起 1.5） | 0.075（0.15） | 0 | 3.75（7.5） | — |
| Grok 4.7 | 2 | 0.5 | 0 | 6 | ≥200K：4 / 1 / 0 / 12 |
| Grok Build 0.1（别名 grok-code-fast-1） | 1 | 0.2 | 0 | 2 | ≥200K：2 / 0.4 / 0 / 4 |

长上下文一栏依次为输入 / 缓存读取 / 缓存写入 / 输出。xAI 规定提示词**满 200K** 即整次按高价，故阈值写 `"above": 199999`。

## 计价口径

- **长上下文阶梯**：本次提示（未缓存输入＋缓存读取＋缓存写入）超过阈值时，整次调用各桶都按高价计（与 pi-ai 算法一致）。
- **推理 token**：多数来源上报的输出已含推理；antigravity（Gemini 接口）上报的输出不含思考 token，插件按配置 `addReasoningToOutput` 把它补进输出计费。
- **Google 区域与促销**：Gemini 一律按 Global 端点价格计；官方非全球端点价格高 10%，但 Session 路由不含区域，改用 `us`／`eu` 时需以自定义价格表另行覆盖。首发价按促销期净支出折算；Google 实际以 50% 赠金返还，并不是账单单价直接减半。
- Anthropic 1 小时缓存写入的加价、批量（Batch）折扣、工具／搜索附加费不在计算范围内。

## 缓存口径

- Kimi 的缓存写入采用 **5 分钟 TTL** 价格；若显式使用 1 小时缓存，K3.1 Pro／K3 应分别改为 26／40 CNY。
- Qwen 的 `cacheWrite: 0` 沿用隐式缓存口径；显式缓存（创建 15、读取 1）未混入此表。
- 其他 `cacheWrite: 0` 表示该厂商隐式缓存不单独收写入费。

## 参考

- [DeepSeek 价格与错峰](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)
- [xAI Grok 4.7](https://docs.x.ai/developers/models/grok-4.7)、[Grok Build 0.1](https://docs.x.ai/developers/models/grok-build-0.1)
- [Gemini 4 Hydrogen / Carbon / Argon 与 Gemini 3.8 Flash on Google Cloud](https://cloud.google.com/model-garden/pricing?hl=en)
- [Moonshot 模型推理价格](https://platform.kimi.com/docs/pricing/chat)、[阿里云 Qwen3.8-Max](https://help.aliyun.com/zh/model-studio/qwen3-8-max)

修改 `prices.json` 并保存即可，立即生效；校验失败的文件不会替换上一份有效价格（错误写进 DSH 数据目录下的 `plugins/session-fee/status.json`）。
