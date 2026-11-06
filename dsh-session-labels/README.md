# dsh-session-labels

Finder 风格的 DSH 会话标签。名称、颜色和会话关联由 Host 保存，不改会话日志；零 npm 依赖，无外部服务。

## 功能

- **右键会话 → 标签**：位于全部原生操作之后（不改变原生操作顺序）；彩色标签可多选，支持「＋ 新建标签」并立即关联当前会话、清除本会话标签。
- **列表显示**：在「字体色彩」和「标签符号」中二选一，默认字体色彩。字体色彩只用第一个标签给标题上色，其余标签显示为标签符号；不覆盖本体的选中背景。悬停可看完整标签名称。
- **视图选项 → 按标签筛选**：全部、未打标签、多选「任意一个／同时包含」。在分组与分页前筛选，与工作区、搜索、归档条件同时生效，不只是隐藏可见行。字号和选中样式对齐本体视图菜单。
- **设置 → 会话标签**：新建、改名、改色、删除、上下排序，以及在「字体色彩／标签符号」之间切换。展开后可点击未删除会话并跳转。预设为 10 个按色相排列、可直接用于文字的颜色。独立描边标签图标，默认 `order: 10000`；用户的导航排序插件可覆盖它。设置页字号对齐本体设置表单（正文 13px、说明 12px），不再自绘页面大标题。
- 标签跨同一 Host 的工作区共享；筛选仅保存在当前浏览器窗口的 sessionStorage，不影响别的窗口。标签修改最长约 5 秒同步，返回窗口时立即刷新。

## 安装

最低 DSH **0.2.2-rc.1**，Node **24.9+**（使用内置 `node:sqlite`）。桌面 GUI 与 Web profile；无新增 npm 依赖。

桌面版「插件」→「添加插件」，粘贴：

```text
git+https://github.com/fujingzhai/youxia-dsh-plugins.git#dsh-session-labels@0.1.3&path:/dsh-session-labels
```

或在合集根目录链接安装：

```sh
dsh plugin --profile desktop add "link:$PWD/dsh-session-labels"
# Web 版把 desktop 改为 web
```

重启 DSH；Web 页面硬刷新。卸载 `dsh-session-labels` 后重启，不删除标签数据库。

## 数据与安全

- 数据：`$DSH_HOME/session-labels/labels.sqlite`；未设置 `DSH_HOME` 时为 `~/.dsh/session-labels/labels.sqlite`。可在关闭所有 DSH 实例后备份该文件。
- SQLite 事务串行处理多个 Host 进程，避免 JSON 文件读改写互相覆盖；写入失败回滚。稳定标签 ID 保证改名不丢关联，过期编辑检测冲突。
- 每个 HTTP 请求走 DSH `connection.admit`，仅接受 owner；写入仅接受 JSON，限制请求体，校验名称、颜色、会话 ID。不允许未认证访问，不开 CORS。
- 删除标签仅移除标签及其关联，不删除会话。设置中的关联数包含已归档和已删除会话；展开后可看标题、更新时间、工作区，并单独取消关联。已删除指会话目录已不存在；标题仍尽量从本机缓存读取。
- 不自动给分叉会话继承标签；新会话手动打标。不发送遥测、不执行子进程、不自动安装其他插件。

## 兼容边界

右键、设置、图标、行尾标签符号、悬停、浮层均使用 DSH 正式接口。以下两处是 **0.2.2-rc.1 兼容适配**，不是上游稳定 API：

1. 用已有 Slot 台账包裹 `sidebar.workspaces` 组件，为其传入只读的筛选后 `useSessions` 快照，不改 Host 的 sessions 服务、不复制本体组件。筛选开启期间阻止本体把子集保存成完整手动排序；要拖动调整会话顺序，请先恢复「全部标签」。远程正文搜索结果也取标签交集，但仍受本体结果数量上限限制。卸载恢复原组件。
2. 本体尚无视图选项扩展 slot，也没有搜索按钮旁的按钮位。通过原生菜单的三个归档选项语义定位，Portal 追加标签筛选；支持简体中文／英文。其他语言暂无此菜单项。整行上色依赖 `data-row-key="session:…"`，不依赖哈希 CSS 类名。

适配失败时禁用筛选而不是误隐藏会话，右键打标与设置管理仍可使用。未知上游版本需重新验证；主题可能覆盖标题颜色，此时使用标签符号。与同样替换工作区 Slot 的插件组合需要单独验证。

## 测试

```sh
node --test test/*.test.js
```

覆盖校验、原子创建并打标、重命名、删除关联、幂等写入、失败回滚、访问鉴权、多标签筛选、手动排序写入保护和远程搜索交集。

2026-11-06，在 macOS、DSH **0.2.2-rc.1**、独立 `DSH_HOME`＋Web profile 中完成 GUI 主流程实测：

- 原生右键菜单最后一项为「标签」，创建并打标、单会话多标签成功。
- 字体色彩、标签符号两种模式均生效；原生绿色未读点保留。
- 原生视图选项内的任意／全部多选、未打标签、恢复全部，以及单列表、归档条件交集成功。
- 设置位于原生项目后，有独立图标；创建、改名、改色、删除关联成功。
- 页面重载后标签与当前窗口筛选保留；未认证请求实际返回 HTTP 403。
- 标题搜索与标签筛选已实测；该隔离 profile 的本体正文索引为 `openAt: never`，正文搜索仅完成交集单元测试，**未宣称端到端通过**。

实测截图：[右键菜单](docs/context-menu.png) · [原生视图选项](docs/view-options.png)。

未覆盖：Windows／Linux、其他主题／语言、超大量会话、热卸载恢复、与其他替换工作区 Slot 插件的组合。

## 社区调研

- [tuogusa/dsh-session-tags](https://github.com/tuogusa/dsh-session-tags)：设置页标签管理与搜索。
- [shuiyujinlan/dsh-session-tags](https://github.com/shuiyujinlan/dsh-session-tags)：彩色层级标签树，但旧版侧栏 CSS 类名、行首小点不适合本插件的集成目标。
- [DSH 会话菜单扩展设计](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/.agents/notes/archived/architecture/2026-09-17-session-row-menu-actions-slot.zh.md)。

参考以上功能和公开接口，代码独立实现；包名使用 `dsh-session-labels`，避免与社区已有 `dsh-session-tags` 重名。MIT。
