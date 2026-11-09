# dsh-settings-customizer · 设置导航定制

统一覆盖 DSH 设置导航的**顺序、名称、图标**，不修改其他插件源码，不改设置页内部标题或内容。原名 `dsh-settings-order`。

**公共默认不含任何个人规则，安装后不改变界面。** 每个人的配置留在自己的 DSH profile，更新插件不会覆盖；无需编辑 `client.js`。

## 安装

桌面版在「插件 → 添加插件」优先填 npm 包名：

```text
dsh-settings-customizer
```

命令行：

```sh
dsh plugin --profile desktop add dsh-settings-customizer
```

仅需固定 Git 版本时使用下面地址；Git 安装不显示原生 npm 更新入口：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-settings-customizer@0.3.2&path:/dsh-settings-customizer
```

### 检查更新

DSH 0.2.2-rc.1 已支持 npm 插件原生更新：打开「插件」点「刷新」，或进本插件详情的「版本 → 重新检查」；发现兼容新版后点击「更新到 <版本>」并确认，无需手动卸载重装。只在打开详情／刷新列表时检查，不是全局推送，不自动升级。个人顺序、名称与图标规则保存在 profile，更新包代码不覆盖；按结果提示刷新／重启。Git、压缩包和 `link:` 不适用，先保留定制与数据，勿贸然卸载；详见[仓库更新说明](../README.md#检查更新与原地升级)。

Web 版把 `desktop` 换成 `web`。首次安装后重启 DSH。

要求 Node ≥24.9、DSH ≥0.2.2-rc.1。新增依赖 `@deepseek-ai/schemastery ~3.19.0`，用于 DSH 原生配置 schema 与 live 配置投影。macOS 0.2.2-rc.1 的验证范围见仓库变更记录；其他系统未做 GUI 实测。

## 个人配置

编辑自己的 profile `cordis.patch.yml`（默认 `~/.dsh/profiles/desktop/cordis.patch.yml`；自定义 `DSH_HOME` 时在其下寻找），追加／修改以下条目。**不要改插件自带的 `cordis.patch.yml`**。以下 id 和名称均为虚构示例，不会自动应用：

```yaml
- id: settings-customizer
  name: dsh-settings-customizer
  config:
    autoOrder: false
    extraStart: 40
    rules:
      sample-billing:
        order: 30
        label: 账单管理
        icon: credit-card
      sample-code:
        order: 31
        label: 编程服务
        icon: code
      sample-chat:
        order: 32
        icon: bot
```

- `rules` 的键是 **`settings.section` 的 id**，不一定等于包名。可查目标插件的注册代码；未知 id 无界面效果。
- `order` 越小越靠前。不填时保留原值，除非主动开启 `autoOrder`。
- `label` 只覆盖导航名称；不填就保留原名称及其语言切换行为。固定字符串不随语言切换；个人配置不支持执行 JavaScript。
- `icon` 不填就保留原图标。内置名称：`credit-card`、`code`、`bot`、`globe`、`star`。
- 官方页也可以显式写入规则；不写就保持原样。
- `autoOrder: true` 时，未指定 order 的第三方页从 `extraStart` 起按本次加载首次遇到的顺序分配；官方页仍不动。默认 `false`，不会替用户擅自排序。
- 自动排序不是动态计算“全部官方页之后”：起点由用户选定，归档会话等官方尾部项仍保持原位置。DSH 增加新的官方页时，可能需要更新插件的官方 id 列表。
- 清除某项覆盖，删除该项对应字段并保存即可。整个 `rules` 清空且 `autoOrder: false` 时恢复原样。

保存 YAML 后，DSH 重新加载 profile 并接受配置，已连接的客户端通过原生配置投影同步，无需修改／重新打包插件。未同步时可重启 DSH；初次迁移旧版必须重启。此版不另建可视化规则编辑器。

### 自定义 SVG 图标

不使用外部图片地址，也不接受整段 SVG/HTML。用 SVG path 数据描述，避免脚本执行或加载网络图标：

```yaml
      sample-code:
        icon:
          viewBox: 0 0 24 24
          paths:
            - M3 5h18v14H3z
            - M3 10h18
```

最多 64 条非空路径，每条最长 16384 字符；viewBox 的宽高须为正数。采用描边、`currentColor`，跟随主题和选中态；尺寸由 DSH 设置壳提供。`0 0 16 16` 使用线宽 1.3，与设置导航的 medium 图标一致；`0 0 24 24` 仍为 1.7。不支持任意脚本、React 函数或 SVG 事件属性。

## 隐私与更新

- 仓库与发布包只含通用代码、空默认值、虚构示例及测试，没有作者的实际排序、名称、图标规则。
- 配置留在 **Host 的 profile 文件**，不在插件仓库里，不会因 `git add`／发布此插件而进入 GitHub。不要手动把个人 profile 复制到仓库，或把其中内容改写进公共源码、测试及截图。
- 这些字段不是密钥：DSH 会把配置投影给连接此 Host 且有设置读取权限的客户端。因此“私人配置不上传 GitHub”不等于“配置对所有远程客户端保密”。共用同一 Host 的客户端共用这一套规则。
- 插件没有额外的遥测、上传或外部图标请求。必要通信仅走 DSH 的配置同步。
- 更新包代码不会改写 profile 规则；卸载后恢复原插件表现，profile 中的规则可留待重装或自行删除。

## 从本地旧版迁移

0.2.x 将 `RULES` 写在源码中。先把自己的规则手动迁到上述 profile，再把本地安装链接改到新版／安装公开包。新版默认空规则，**不会自动扫描或上传旧源码**。旧 `dsh-settings-order` 和新版不要同时启用。

## 实现边界与验证

顺序与名称沿用对槽位注册台账的兼容性包装，处理先注册、后注册及语言切换后的重注册；字段原值会在卸载时还原。图标用官方 `settings.section.icon` 同 id、低 priority 遮蔽，不做 DOM 替换。

修改其他插件的台账字段不是官方公开的更新 API，DSH 若调整台账结构，需要适配。此插件不拦截设置页内部自行渲染的标题或图标。

```sh
npm install --ignore-scripts
npm test
```

测试包括空公共默认、配置 schema、先后加载、重复图标优先级、配置更新、清除规则和卸载恢复。

参考：[原生配置表单](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-settings-card.md)、[设置扩展点](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings/README.md)。

MIT
