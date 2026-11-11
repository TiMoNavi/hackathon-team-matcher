# Matcha 代码质量与本地运行评审

评审日期：2026-11-11（Asia/Shanghai）。这是第三方参考工程的检查记录，不表示 hackathon-team-matcher 目标应用已经实现。

## 结论

Matcha 适合作为黑客松展示原型和页面流程参考，工程质量偏低，不建议作为真实多用户产品的基础继续堆功能。主要问题集中在身份真实性、数据隔离、业务闭环和可复现部署，已经影响核心正确性，并非仅是代码风格问题。

桌面首页有完整视觉设计，React 页面划分和简单 API 封装易读；匹配器采用规则预筛选再交给模型、按活动查询候选、按参与者 ID 合并结果，这些思路有参考价值。但 README 描述的安全认证、密码恢复、消息沟通、团队管理，明显超出当前代码实际完成度。

## 来源与范围

- 上游：`https://github.com/Siriapps/Matcha`，分支 `main`。
- 本次独立克隆：`../Matcha`，提交 `bd76da02f3193217882d6e8bf6df3712c84cb9f9`；检查时 `git ls-remote origin refs/heads/main` 与本地一致。
- 上游提交时间：2026-01-04T17:51:55-06:00。原有 `../用户画像处理/repos/Matcha` 副本未改动。
- 环境：Node.js 24.18.0、npm 11.16.0、隔离 Python 3.12.13。
- 审查使用项目 architecture-patterns 技能，关注依赖边界、业务用例与外部服务的分离，没有重构该参考工程。
- 未修改上游跟踪文件；新增忽略的 `frontend/.env.local` 只将 Flask API 指向本机 5058 端口。安装依赖、虚拟环境与构建输出留在本地。
- 未读取 `.local/` 凭据、未连接真实 MongoDB/Devpost/Gemini、未使用真实用户资料。冻结文档和当前产品设计文档未改动。

## 实际运行结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `npm ci --ignore-scripts` | 通过 | 根据原锁文件安装 372 个包 |
| `npm run build` | 通过 | Vite 5.4.21，60 个模块；JS 299.82 kB，gzip 82.77 kB |
| 前端服务 | 已启动 | `http://127.0.0.1:5178/`，浏览器实际打开 |
| 桌面与移动页面 | 已检查 | 保存截图；移动首页有明显横向溢出 |
| 登录与刷新 | 已复现缺陷 | 任意非空密码进入；刷新重新回到登录页 |
| 消息与组队 | 已复现 mock | 无聊天 API 请求，定时生成对方回复并直接加入团队 |
| Flask 服务 | 已启动 | `http://127.0.0.1:5058/` 返回 200 |
| `/api/stats` | 500 | 没有本地 MongoDB；本次连接只指向回环地址 |
| `/api/find-teammates` | 500 | 明确返回 Gemini API key 未配置 |
| Node 认证服务 | 无法启动 | 缺依赖位置和多个被引用的源文件 |
| 六项后端隔离复现 | 全部复现 | 使用内存替身，PASS 表示确认有该问题，不代表质量合格 |
| 原仓库自动化测试 | 未找到 | 跟踪文件内没有测试/CI 配置，package scripts 无 test/lint/typecheck |

首次 Python 安装解析到 `cryptography==50.0.2`，本机源码编译因 OpenSSL/pkg-config 条件不足失败。随后使用 `uv pip install --only-binary :all:` 成功解析为可安装的 wheel（cryptography 48.0.1），未修改 requirements。此项属于环境与传递依赖可复现性限制，不等同于应用业务缺陷。

默认浏览器工具的系统 Chrome 启动异常，改用独立 Playwright 和已有 Chromium headless shell 完成真实浏览器检查。

## 主要问题，按严重程度排列

### 1. 严重：匿名抓取接口会清空全部参与者集合

[backend/app.py](../Matcha/backend/app.py) 第 253–307 行：`/api/scrape` 没有身份验证；抓取成功后执行 `collection.delete_many({})`，再写入本次活动数据。

影响：一次活动抓取会删除其他活动的参与者；并发抓取存在互相覆盖或混入数据的风险。没有事务保护，删除成功后插入失败也会造成数据丢失。

已用伪造抓取结果和内存 Mongo 替身复现：不带 Authorization 的请求返回 200，并调用 `delete_many({})`。未对真实数据库执行删除。

### 2. 严重：URL 校验可绕过，服务端浏览器会接收非 Devpost 地址

[backend/app.py](../Matcha/backend/app.py) 第 263–271 行仅判断字符串是否包含 `devpost.com`；第 70–87 行把输入交给 Selenium。

影响：服务端请求伪造风险。把该字符串放到路径中，地址的实际主机仍可以是回环或其他非 Devpost 主机。还缺少重定向及目标地址范围的验证。

隔离测试用 `http://127.0.0.1:9/devpost.com` 证明地址到达驱动的 `get()`。驱动完全使用替身，没有实际请求该地址；这证明验证失效和危险数据流，不声称已利用生产系统。

### 3. 高：登录只是假身份，刷新还会丢会话

[AuthContext.jsx](../Matcha/frontend/src/context/AuthContext.jsx) 第 27–42 行没有验证密码或调用认证接口，直接构造用户并设置 `emailVerified: true`。实际入口没有接入 Auth0 Provider。

[userStorage.js](../Matcha/frontend/src/utils/userStorage.js) 第 30–33 行读取 `matcha_current_user`，第 46–65 行却只写 `matcha_users`。读写键不一致导致刷新掉登录。

浏览器中使用合成邮箱和任意密码成功进入 `/survey`；没有 fetch/XHR；刷新后跳回 `/login`。重复登录会重新生成 `Date.now()` ID，当前上下文也没有恢复此前确认的画像。

### 4. 高：匹配对象并非登录用户

[backend/app.py](../Matcha/backend/app.py) 第 338–374 行，以及搜索入口第 394–434 行：服务端只取活动中的第一条参与者记录作为 `current_user`。前端 [api.js](../Matcha/frontend/src/services/api.js) 只发送活动名称，没有可信用户身份。

影响：用户认真填写的技能与目标没有成为这条匹配链路的个人输入；不同用户可能一直在替同一位参与者找队友。按 hackathon 字段过滤候选值得保留，但它不等于验证调用者属于该活动。

隔离复现中，匿名调用也能把 `first-record` 作为当前用户交给匹配器。

### 5. 高：聊天与入队由前端自动编造

[Messages.jsx](../Matcha/frontend/src/pages/Messages.jsx) 第 75–139 行：发送消息只更新 React state，两秒后自动回复 `Sure, I'd love to join!`，并调用 `teamStorage.addMember()`。

[teamStorage.js](../Matcha/frontend/src/utils/teamStorage.js) 直接将成员标为 `accepted`，写入全局 `matcha_team` 键。没有对方真实操作、服务端成员关系或活动隔离。

浏览器已验证回复和入队全程没有 fetch/XHR。消息只在组件状态中；团队和想法的 localStorage 键也没有按用户/活动隔离。这只能作为演示交互，不能作为社交业务实现。

### 6. 高：Node 服务交付不完整，两个后端的配置互相冲突

[frontend/package.json](../Matcha/frontend/package.json) 的 `dev:server` 执行 `cd server`，但实际 server 是 frontend 的同级目录。运行直接报目录不存在。

直接 `node server/index.js` 先报 `dotenv` 找不到，因为依赖安装在 frontend 下；临时通过 NODE_PATH 指向 frontend/node_modules 后，又报 `./routes/auth` 缺失。

[server/index.js](../Matcha/server/index.js) 还引用缺失的 `routes/ideas`；[users.js](../Matcha/server/routes/users.js) 引用缺失的 `utils/userStorage`。这些不是补一个环境变量就能解决的问题。

[Ideas.jsx](../Matcha/frontend/src/pages/Ideas.jsx) 默认指向 Node 的 3001，并请求 `/ideas/generate`；匹配 API 默认指向 Flask 的 5000，两者却共用 `VITE_API_URL`。本次将该变量指向本地 Flask 后，Ideas 所需的 `/api/ideas/generate` 返回 404；原本默认 Node 服务也无法启动。

### 7. 中高：AI 错误被包装成正常匹配，输出缺少结构验证

[teammate_matcher.py](../Matcha/backend/teammate_matcher.py) 第 357–362、459–477 行：任何批次异常都改用“项目数×10＋技能数×5”的分数，返回值没有标识降级，路由仍可能返回 success。该评分不使用当前用户的互补性或搜索要求。

已隔离复现模型抛错仍返回 25 分匹配；模型返回 10000 分也会原样保留。JSON 能解析不代表分数类型、范围和字段满足业务契约。

现有预筛选最多 50 人，普通匹配按 20 人一批，搜索按 30 人一批；这是一定的成本控制，但仍先把整场活动候选读入内存，缺少作业状态、超时取消与明确预算错误。构造函数直接创建 Mongo 和模型 SDK，业务测试需要 monkeypatch，说明接口边界不足。

### 8. 中：界面完成度和资料功能不足

- 移动首页测试视口宽 390 px，文档宽 885 px；[Landing.jsx](../Matcha/frontend/src/pages/Landing.jsx) 第 128 行起的轮播使用 overflow-visible 和固定位置，截图可见明显横向溢出。
- [ProfileSetupStep2.jsx](../Matcha/frontend/src/pages/ProfileSetupStep2.jsx) 第 31–45 行只检查文件类型/大小、保存文件名，没有上传 PDF 内容或解析简历。
- [ForgotPassword.jsx](../Matcha/frontend/src/pages/ForgotPassword.jsx) 和 [ResetPassword.jsx](../Matcha/frontend/src/pages/ResetPassword.jsx) 都显示 coming soon。
- Ideas 页 835 行；Flask app 581 行，同时处理 HTTP、抓取、数据库和模型提示词。根目录 src 与 frontend/src 存在重复版本，当前入口实际使用后者，维护时容易改错。
- Python 路由用宽泛异常捕获把原异常文本返回客户端；无效 JSON 实测返回 500，未保留合理的 400 输入错误语义。

## 依赖审计

本次 `npm audit --json` 返回 51 个受影响包条目：4 critical、16 high、26 moderate、5 low。原始记录见 [npm-audit.json](artifacts/npm-audit.json)。

这是安装依赖图的审计结果，包含开发依赖和传递告警，不能等同于 51 个独立、可从产品入口利用的漏洞。尤其 package.json 把 Express、邮件服务和并行启动工具等混放在前端依赖中，单看数量容易误判实际浏览器暴露面。没有运行 audit fix，原锁文件保留不变。

## 对当前项目的参考价值

可以参考首页视觉、技能选择、匹配进度、结果卡片，以及“规则召回后模型精排”的流程。当前代码的认证、消息、入队、数据库更新和资料存储不适合作为本项目实现模板。

与本项目要求差距包括：缺少服务端验证的活动资格、确认后字段可见性、真实用户触发的社交操作、资料优先导入、版本化异步结果和明确的 AI 失败语义。其按活动查询是有用起点，但还没有形成可信的授权边界。

若要借用，建议只提取交互参考；业务用例按现有共享契约重新实现，HTTP、数据库、抓取和模型放在外层适配器，用内存适配器验证活动隔离和授权。没有必要照搬 Flask 加不完整 Express 的双后端。

## 本地查看与复跑

此次服务绑定回环地址，交付时前端 5178、Flask 5058 均可访问。服务停止后可分别在两个终端重新启动：

```sh
cd /Users/550m/code/hackathon-team-matcher/references/Matcha/frontend
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
```

```sh
cd /Users/550m/code/hackathon-team-matcher/references/Matcha/backend
MONGODB_URI='mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=1000&connectTimeoutMS=1000' \
GEMINI_API_KEY='' \
../.venv/bin/python -m flask --app app run --host 127.0.0.1 --port 5058 --no-reload --no-debugger
```

以上只启动可检查的原型；不会补齐数据库、真实身份、Devpost 登录或 Gemini 凭据，因此不能据此声称完整匹配链路成功。可输入合成邮箱和任意非空密码浏览 mock 登录后的页面，刷新掉会话是本次确认的缺陷。

检查脚本和结果：

- [后端复现脚本](backend-review.py) 与 [六项结果](artifacts/backend-review.txt)。运行 `../Matcha/.venv/bin/python backend-review.py`。
- [浏览器脚本](browser-review.mjs) 与 [浏览器记录](artifacts/browser-review.json)。运行 `node browser-review.mjs`；如默认浏览器不存在，通过 `MATCHA_CHROMIUM` 指定本机 Chromium 可执行文件。
- [实际 HTTP 结果](artifacts/http-probes.json)。
- [桌面首页](artifacts/landing.png)、[移动首页](artifacts/landing-mobile.png)、[登录后](artifacts/after-login.png)、[消息自动回复](artifacts/messages.png)。
- [Python 依赖快照](artifacts/python-dependencies.txt)。

复现脚本属于本次外部评审工具，不是上游原有测试套件；测试数据全部为合成。
