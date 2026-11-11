# AI 用户画像后端选型

> **选型结论已撤回（2026-11-10）**：用户明确需要按需 AI 辅助录入、修改、确认后存入业务数据库。当前入口为 [AI 辅助资料录入后端选型](AI辅助资料录入后端选型.md)。下文保留前次记忆类候选的事实记录，第 2–7 节的采用排序与试验建议不再代表当前建议。

> 调研日期：2026-11-10。用户已将本轮重点收敛到 AI 用户画像，聊天可独立选型。本文依据公开文档、默认分支固定提交及局部源码；未部署候选、未调用模型、未运行候选测试，不表示目标应用已实现。

## 1. 结论

前次优先 Memobase 的建议建立在“需要画像记忆服务”的理解上，与用户进一步明确的按需资料编辑需求不符，已撤回。当前优先研究简历编辑后端的结构化提取、修改预览与确认保存流程，具体见新版选型。

“拆分”先落实为明确的功能和数据边界，不必立刻拆成多个独立服务。画像引擎负责提取与形成候选画像；本项目仍保留已确认资料、可见性、活动偏好和匹配资格的业务权威。

## 2. 比较

| 候选 | 定位 | 可复用能力 | 本轮判断 |
|---|---|---|---|
| Memobase | 可自托管的用户画像记忆后端 | 按用户管理画像，配置 topic/subtopic，提取/合并信息、画像 CRUD、事件记忆、MCP 示例 | 最先做隔离验证；字段化画像与当前需要接近 |
| LangMem | Python 库，不是完整独立后端 | 按 Pydantic/JSON Schema 提取和更新画像，支持传入已有画像，核心能力可接自有存储 | 希望保留数据库与任务控制时的备选，仍需 API/任务/权限层 |
| Honcho | 用户及其他实体的长期推理记忆服务 | FastAPI、消息/会话、peer representations、稳定事实 peer cards、SDK 与 MCP 集成路径 | 适合持续理解用户，范围更广；当前按需资料编辑不必先引入全部机制 |
| Mem0 | 通用个性化记忆库与服务 | 按用户提取、保存和检索记忆；有自托管 FastAPI 服务 | 可作事实记忆层；不能将托管平台 Profiles 当成已核实可自托管能力 |

## 3. Memobase：最接近所需功能，但需要适配

### 已核实

- 服务端依赖 FastAPI；官方 Compose 包含 PostgreSQL/pgvector、Redis 与 API。它确实具有后端实现，不只是调用模型的演示页面。
- 通过 `overwrite_user_profiles` 定义画像主题及子字段；`profile_strict_mode: true` 限制提取范围。默认灵活模式允许增加子主题，不能不改配置就当成固定业务 schema。
- `profile_validate_mode` 对提取内容和字段适配做检查，但这不是用户确认，也不保证内容真实。
- API 实现包含按用户读取、添加、更新和删除画像。输出围绕主题、子主题与内容，仍需映射到本项目有类型约束的业务字段。
- 仓库有 MCP 模板，包含 `save_memory`、`get_user_profiles`、`search_memories`。

### 复用范围

建议先自定义技能、项目经历、兴趣、合作意向等业务允许字段，用已有资料和问答文本生成草稿。不要把默认画像分类直接当产品要求。

本轮没有核实它具备简历 PDF 解析、GitHub OAuth/导入、十步问答 UI 或推荐匹配引擎；这些仍由外围导入与应用用例承担。已有事件记忆中的 event 指记忆时间线条目，不能直接当成本项目的活动及成员权限模型。

### 需要优先验证的具体问题

1. **维护状态**：本次 GitHub 元数据显示最近推送为 2026-01-11，README 将 Acontext 列为新项目。不能据此断言已停止维护，但也不能称为近期持续活跃；正式采用前应验证安装、依赖和修复可行性。
2. **多用户 MCP**：所查 `src/mcp/src/main.py` 使用固定 `DEFAULT_USER_ID = string_to_uuid("user")`，三个工具均使用该 ID。这是模板，不是可直接开放给多用户产品的认证与隔离实现。身份必须由服务端可信会话映射，不能让模型任意指定。
3. **触发和并发**：存在缓冲批处理、容量触发 flush，文档也给出周期 flush 参数；`flush_buffer_by_ids` 留有并发可能重复 flush 的 FIXME。该注释不是本次复现的缺陷，但足以将并发幂等列为试验项。不能把默认后台更新策略直接接到所有聊天。
4. **确认边界**：AI 提取/合并结果只进入私有草稿；用户主动确认后，应用层再更新确认版本。旧任务、撤销任务和重试不得覆盖新确认资料。
5. **许可**：仓库标注 Apache-2.0；不代表模型服务、第三方依赖及部署配置已经完成全部审查。

## 4. 其他候选的适用边界

### LangMem

官方 `manage_user_profile.md` 提供 `create_memory_manager` 配合 Pydantic 模型、`existing` 已有资料和单一画像更新的示例；另有 `create_memory_store_manager` 的用户 namespace 示例。它适合由本项目控制何时调用、给什么资料、结果何时写库。MIT 许可。

可先采用不直接写业务存储的提取路径，将结果交由应用用例保存为待确认草稿。namespace 是数据组织机制，不自动提供终端用户鉴权。本轮不承诺比 Memobase 省多少工期，也不声称它自带完整的个人中心或活动系统。

### Honcho

官方 README 和依赖表确认其核心为 FastAPI 服务，支持自托管；会将输入消息用于异步推理、更新 peer representations。peer card 提供姓名、职业、偏好等稳定事实摘要，且有更新控制配置。仓库有集成与回归测试目录，本次未执行。AGPL-3.0。

其“知道某人的哪些事情”和“对某人的推断”不能直接成为公开画像。多 peer 观察关系也不等于本项目好友与活动权限。只有本人导入或主动重编辑的授权流程才提供相应资料；不因为存在聊天系统就把全部私聊或群聊持续送去画像。对当前需要，建议作为长期推理方向备选，而非默认部署。

### Mem0

开源仓库提供记忆库、自托管 FastAPI 服务与管理界面；可用于提取与检索用户相关事实。Apache-2.0。

但所查 `docs/platform/features/user-profiles.mdx` 将 Profiles 标为 beta、需联系平台开通，示例使用 `MemoryClient`；支持 JSON Schema 和异步生成的产品说明不能直接证明开源自托管实现了同样接口。抽查 `server/main.py` 主要为 memories CRUD/search，未发现对应完整 Profiles 路由。正式选择前需验证目标版本或取得平台能力确认。

## 5. 建议的接入流程

```text
本人导入简历 / GitHub 公开来源 / 主动填写问答
                ↓
应用层校验来源、授权和当前编辑版本
                ↓
Memobase 或 LangMem 提取、归纳、提出待确认字段
                ↓
私有画像草稿 + 来源引用 + 任务与版本信息
                ↓
用户确认、补缺、选择字段可见性
                ↓
本项目确认画像库 → 个人中心 / 当前活动内筛选与匹配
```

来源引用、用户确认、字段可见性和任务版本为本项目需要保留的能力，不表示候选已经完整提供。原始资料与确认资料维持现有私存、删除和按需使用规则。普通浏览、切活动、改变可见性不触发模型；也不自动周期性抓取第三方或重跑画像。

画像的全局属性与活动偏好分开。用于推荐时仍由应用层验证当前活动和可见范围，候选引擎不获得绕过这些校验的权限。普通发现/换一批继续保持 0 次 LLM 调用。

MCP 是外部协议适配入口，Skill 是受控流程配置；二者都不自动取得发布、好友、消息或联系人授权权限。内部画像任务可以直接调用适配器，无需为所有调用强制增加 MCP 网络跳转。

## 6. 最小试验与决策

只选 Memobase 先验证一个小样本流程，用明确标注的合成资料或用户明确提供的测试资料，不自动读取现有私有原文。

- 同一份资料能否稳定抽取自定义字段，缺失项留空而非编造。
- 修正经历或技能后能否形成新草稿，保留必要来源关系，不静默覆盖已确认版本。
- 两个测试用户的 API/MCP/缓存是否隔离，模型无法通过参数切换身份。
- 按需触发、并发重试、取消和删除是否符合应用要求，能否清除衍生数据。
- 实测模型调用次数、成本和延迟；不沿用仓库宣传的收益数字作为本项目结论。

若适配与维护负担过大，改用 LangMem 的提取原语嵌入现有模块化单体，复用 AI 处理能力并保留自己的业务存储。此处仅提出验证顺序，本轮未部署、未新增运行服务。

本报告延续项目 architecture-patterns Skill 的边界约束。关联：[上一轮后端选型](后端模块复用与AI接入选型.md)、[架构与领域](../docs/系统架构与领域设计.md)、[共享契约](../docs/共享数据与接口契约.md)。

## 7. 固定提交与一手来源

星数是 2026-11-10 查询快照，不代表质量；固定提交为默认分支快照，不是本次验证过的稳定发行。

| 项目 | Stars | 许可证标记 | 固定提交 |
|---|---:|---|---|
| [memodb-io/memobase](https://github.com/memodb-io/memobase) | 2,957 | Apache-2.0 | [358c16bbc6d6](https://github.com/memodb-io/memobase/tree/358c16bbc6d687937d79bc2f984a11c3be8da901) |
| [langchain-ai/langmem](https://github.com/langchain-ai/langmem) | 1,759 | MIT | [8620b986af5b](https://github.com/langchain-ai/langmem/tree/8620b986af5b0c7593e6b7fbece2998690d22d15) |
| [plastic-labs/honcho](https://github.com/plastic-labs/honcho) | 8,050 | AGPL-3.0 | [afe361b03ffe](https://github.com/plastic-labs/honcho/tree/afe361b03ffe50d8acc1d2277e55810ff85d7b36) |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | 68,755 | Apache-2.0 | [f1791daa86d4](https://github.com/mem0ai/mem0/tree/f1791daa86d469249c9b002f62644d58a1eb96a0) |

已阅读的主要证据：

- memodb-io/memobase：[readme.md](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/readme.md)
- memodb-io/memobase：[docs/site/features/profile/profile.mdx](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/docs/site/features/profile/profile.mdx)
- memodb-io/memobase：[docs/site/features/profile/profile_config.mdx](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/docs/site/features/profile/profile_config.mdx)
- memodb-io/memobase：[src/server/api/pyproject.toml](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/pyproject.toml)
- memodb-io/memobase：[src/server/docker-compose.yml](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/docker-compose.yml)
- memodb-io/memobase：[src/server/api/memobase_server/api_layer/profile.py](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/api_layer/profile.py)
- memodb-io/memobase：[src/server/api/memobase_server/controllers/buffer.py](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/buffer.py)
- memodb-io/memobase：[src/mcp/src/main.py](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/mcp/src/main.py)
- langchain-ai/langmem：[README.md](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/README.md)
- langchain-ai/langmem：[docs/docs/guides/manage_user_profile.md](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/docs/docs/guides/manage_user_profile.md)
- plastic-labs/honcho：[README.md](https://github.com/plastic-labs/honcho/blob/afe361b03ffe50d8acc1d2277e55810ff85d7b36/README.md)
- plastic-labs/honcho：[docs/v3/documentation/features/advanced/peer-card.mdx](https://github.com/plastic-labs/honcho/blob/afe361b03ffe50d8acc1d2277e55810ff85d7b36/docs/v3/documentation/features/advanced/peer-card.mdx)
- plastic-labs/honcho：[docs/v3/documentation/core-concepts/representation.mdx](https://github.com/plastic-labs/honcho/blob/afe361b03ffe50d8acc1d2277e55810ff85d7b36/docs/v3/documentation/core-concepts/representation.mdx)
- mem0ai/mem0：[server/README.md](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/server/README.md)
- mem0ai/mem0：[server/main.py](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/server/main.py)
- mem0ai/mem0：[docs/platform/features/user-profiles.mdx](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/docs/platform/features/user-profiles.mdx)
