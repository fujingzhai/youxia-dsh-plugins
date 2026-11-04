# youxia-dsh-plugins

自己日常在用的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件，整理成通用版本后陆续收录。

| 插件 | 作用 |
|---|---|
| [dsh-pi-mode](dsh-pi-mode) | 新增「Pi 模式」：工具与系统提示词以 [pi](https://github.com/earendil-works/pi) 为蓝本，精简直接；首步输入不到标准模式的一半 |

## 安装

每个插件是一个独立的 DSH 组合包，按需单装：

```bash
git clone https://github.com/fujingzhai/youxia-dsh-plugins.git
dsh plugin --profile desktop add link:$PWD/youxia-dsh-plugins/<插件名>
```

桌面版的 `dsh` 命令在 `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`。装好后重启 DSH。

也可以把插件目录交给你的 agent：各插件的 README 里写了安装后的适配步骤，agent 照着做即可。

## 许可

MIT
