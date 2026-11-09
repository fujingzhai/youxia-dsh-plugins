# dsh-speed-pair

**底栏的输出速度改成双口径：`207(122) tok/s`。括号外是首字之后的纯解码速度（DSH 原口径），括号内是整段速度（请求发出→收完，含首字延迟，即 pi 底栏那个数）。**

- 两个数出自同一批步骤、同一份输出 token：只是分母不同，不会各算各的。
- 点一下弹出明细：轮/步、模型用时、工具调用用时、首 token 平均（TTFT）、生成用时，以及两个速度各一行。
- 顶替 DSH 自带的「会话统计」那颗 pill，位置、外观、点击行为都沿用宿主；插件没载入时自带那颗照旧显示（CSS 用 `:has()` 判定，不会两头落空）。

## 两个数分别是什么

| 位置 | 算法 | 含义 |
|---|---|---|
| 括号外 X | Σ输出 ÷ Σ(首 token → 收完) | 字往外冒得多快。与模型能力对照、跟榜单口径一致；不含干等首字的时间 |
| 括号内 Y | Σ输出 ÷ Σ(请求发出 → 收完) | 你实际等了多久才拿到这些字。agent 每步前面要等一次 TTFT，这一步往往占三到四成 |

数据全部读自 DSH 自带的 `sessionStats` 投影（`decodeTokens`、`decodeMs`、`llmMs`、`ttftMs`），不写会话日志、不另建服务。

## 安装

桌面版「插件」→「添加插件」优先填 npm 包名：

```text
dsh-speed-pair
```

命令行（Web 版把 `desktop` 换成 `web`）：

```sh
dsh plugin --profile desktop add dsh-speed-pair
```

仅需固定 Git 版本时使用下面地址；Git 安装不显示原生 npm 更新入口：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-speed-pair@0.1.0&path:/dsh-speed-pair
```

### 检查更新

DSH 0.2.2-rc.1 已支持 npm 插件原生更新：打开「插件」点「刷新」，或进本插件详情的「版本 → 重新检查」；发现兼容新版后点击「更新到 <版本>」并确认，无需手动卸载重装。只在打开详情／刷新列表时检查，不是全局推送，不自动升级。按结果提示刷新／重启；若自己改过包内的 `SHOW_COUNTS`，升级前保存改动，包文件会被替换。Git、压缩包和 `link:` 不适用，先保留定制与数据，勿贸然卸载；详见[仓库更新说明](../README.md#检查更新与原地升级)。

装完刷新桌面窗口；还没载入就重开 DSH。底栏应显示 `N 轮 M 步 · 207(122) tok/s`，点开有明细。

要求 DSH `0.2.1-rc.5` 及以上、Node `24.9` 及以上，无额外 npm 依赖。已在 macOS 桌面版 DSH `0.2.2-rc.1` 实测底栏读数与明细弹窗；其他平台与系统未实测。

## 边界

- **读数一项没少**：轮/步、模型用时、工具调用用时、首 token 平均（TTFT）都在，另加「生成用时」与括号内那个速度；弹窗标题与宿主一样是「会话统计」，右上角仍是轮/步。宿主用自绘 Tooltip 提示被截断的完整读数，这里改用原生 `title`。
- **简洁模式不生效**：DSH 的「性能与用量」偏好只发给它自己的 pill，第三方插件拿不到，所以本插件始终显示轮/步。只想看速度，把 `client.js` 里 `SHOW_COUNTS` 改成 `false`。
- **与 pi 的细微差别**：pi 会剔掉输出不足 100 token 的步骤、只统计当前模型的回复；这里与 DSH 同源，算全会话全步骤，也不做过滤。
- 宿主若改了 `data-composer-stat` 这类属性，`display:none` 会失效，表现为自带那颗和本插件那颗并存——不影响读数，改选择器即可。
- 不新增 npm 依赖，不改 App，无账号与密钥。

## 开发

```sh
node --check client.js
node --test test/pair.test.js
```

测试用桩 React 走一遍 DSH 的 `window.__ModuleLoader__` 装载路径，验证登记项（`conversation.composer.dock`、`id: speed`、`order: 0`）与两个口径的换算。
