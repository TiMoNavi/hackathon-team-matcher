# P6 用户画像 AI 增强

版本 0.1.0，2026-11-11。依赖 P1 matcher-user-profile ≥ 0.7.0、P2 matcher-onboarding ≥ 0.3.0、HumHub ≥ 1.19.4，以及 PHP JSON、mbstring、cURL 扩展。

本包提供可选模型边界，不保存资料、不直接访问数据库、不确认用户信息，也不提供前端。任务、所有者与 Space 权限、输入版本复验、取消重试和结果采纳由 P1/P2 承担。单独运行本包单元测试不会连接真实网关。

## 服务器组合

- Module::getAiEngine(): ProfileAiEngine；getEngine() 为同义兼容入口。
- Module::setAiEngine(ProfileAiEngine $engine) 为服务器隔离测试注入入口。
- Module::$configPath 只接受服务器配置，默认读取项目私有配置位置；不能从 HTTP 请求、来源资料或模型输出传入。
- 私有 JSON 配置仅包含 base_url、model、api_key；必须是绝对路径的普通可读文件，最多 16 KiB，权限不开放给 group/other（建议 0600）。配置缺失、非法或权限过宽均显示未配置，不把路径或解析原文带入状态或异常。
- base_url 必须固定为 HTTPS，端口为默认值或 443，不接受 URL 用户信息、query、fragment、父目录跳转。末尾已有 /chat/completions 时直接使用，否则追加该路径。运行时不跟随来源链接，不随模型指令切换目标。
- status() 只返回 available、configured、generation_mode、model、operations 与公开限额，不产生模型调用。长驻进程更换配置后需重启或重新组合 engine。

生产网关模型由服务器配置确定。本轮指定模型为 gemini-3.8-flash。请求固定使用 chat completions 的 model、messages、stream=false、temperature=0、max_tokens=8192、response_format={type:json_object}。若响应报告不同模型，则以 AI_MODEL_MISMATCH 失败，并在安全可表示时记录实际报告的模型；不会自动换模型或改用 rules。

## 统一端口

generate(operation, input) 返回 {data, metrics}；operation 仅为 extract / questions / compose。

metrics 为 {model,llm_calls,duration_ms,usage}。usage 为 {prompt_tokens,completion_tokens,total_tokens,reported}。完整且一致的供应商数字原样保留；缺失、非法或不一致时三项为 null 且 reported=false，不把未知值写成 0。调用前的配置、输入、大小错误为 0 次；一旦发起传输，HTTP、超时、解析、schema 和证据失败也计入 1 次。有效 usage 在模型输出验证失败时仍保留。每次 generate 最多一次传输，没有隐式修复、重试或降级。

失败抛 P1 ProfileAiFailure，只有稳定 errorCode、metrics 和通用错误消息。不会传播 previous exception、网关原文、来源原文、提示词或密钥。本包没有请求正文或响应正文日志。

## 精确数据合同

所有 input 来自 P1/P2 已验证的本人快照，不能把外部 HTTP body 直接转发给 engine。所有结果仍是本人私有候选或草稿，真实确认由既有业务用例完成。

### extract

输入：

    {space_id: null|positive-int, sources: [{source_id, version, sections: [{id, text}]}]}

来源附加元数据可存在，但 prepare 仅保留这几个必要字段。最多 8 个来源、合计 200 个片段；单片段最多 32768 个字符。source_id / section id 必须稳定且不可重复，来源版本必须为正整数。

输出：

    {candidates: [{id, key, value, evidence: [{source_id, source_version, section_id}]}], review_items: []}

最多 80 个候选。仅允许 FieldCatalog 普通 global 字段；禁止身份、关系、联系方式二维码资源引用和活动字段。FieldCatalog 的值类型、数量、日期精度、URL 格式等继续生效。证据必须精确命中本次来源版本与片段。描述性值必须能在所引段落找到字面支持，代码须匹配明确标签；自述性格和 MBTI 还需要明确自述标记。无法支持的事实应留在复核提示，不能靠模型猜测。证据检查验证引用与文字对齐，不能代替事实真实性或语义真实性核验。

### questions

输入：

    {space_id: null|positive-int, profiles: {global: {attributes: [...]}, space: {attributes: [...]}}}

attributes 至少包含 attribute_id、key、value、visibility。若传入 confirmation，则必须为 confirmed。没有当前 Space 时不能包含 Space attributes。engine 从 RuleQuestionProvider.questions(profiles, space_id) 获取唯一允许的模板集合，模型选择其中 3–8 题，只可调整 prompt 与 reason。

输出：

    {questions: [既有 QuestionDTO + free_text_option], review_items: []}

id、template_id、target_key、scope、mode、options 中所有 code/label、allow_free_text=true、allow_skip=true 均与允许模板严格一致。新客户端按独立控件呈现每题最后一项：

    free_text_option = {code: "other", label: "其他，我来填写", position: "last", max_length: 1000}

该控件不在 options 内，其 other 不能写入 selected_options。自由回答使用既有 answer_type=free_text、selected_options=[]、free_text="用户填写内容"；选择答案仍为 answer_type=options，可附带既有 free_text 补充。允许跳过。

### compose

输入：

    {profiles, space_id, questions: [已保存的 QuestionDTO], answers: [{question_id, answer_type, selected_options, free_text}]}

每题恰有一个答案或 skipped，所有选项 code 均经相同稳定模板校验。输出：

    {global_fields: [{key,value,visibility,evidence}], space_fields: [...], review_items: []}

每个 evidence 项为下列一种，最多 12 项：

    {type:"profile", scope:"global"|"space", attribute_id}
    {type:"answer", question_id}

结构化值必须与 RulesProfileComposer 的明确答案映射一致，并包含支持该映射的答案引用。不能用跳过答案作证据。仅缺失的 headline / bio 允许重新表述，且只能引用全局资料和全局答案；没有新值时空字段列表合法。现有单值字段、同代码或同值的已有多值条目均禁止覆盖；冲突只能形成 review_items。模型不能提交 attribute_id、删除或确认指令。

最终 visibility 由服务器计算为证据字段及对应已有答案目标的最严格范围，模型只可进一步收紧。headline / bio 保守继承全部输入全局确认资料的最严格范围，即便模型未逐项引用；这可降低草稿默认可见范围，但不会扩大公开范围。P1/P2 应保留 evidence 在私有任务结果中，并在调用普通草稿更新接口时仅传该接口允许的字段。

自然语言改写仍可能出现证据不能支持的语义断言。本包不会宣称能证明任意文案的真实性，也不以脆弱词汇白名单取代自然表达。存在新 headline / bio 时，服务器强制加入不可由模型改写的 server-prose-review 提示，明确“引用校验不等于事实已核实”，要求本人逐句核对。未来前端应同时展示文案、来源和此提示；进入草稿不等于确认或公开。

### 三阶段复核

    review_items: [{id, kind, message, field_keys: [], evidence: []}]

kind 仅为 missing / conflict / uncertain / unsupported。最多 32 项，message 最多 600 字符，field_keys 只能是普通资料键。extract 使用来源证据；questions 使用 profile 证据；compose 使用 profile 或非 skipped answer 证据。缺失项允许空证据。复核提示本身不改资料，不表示用户已同意。

## 执行与安全限额

| 边界 | 限额或行为 |
|---|---|
| 归一化输入 | 128 KiB，合计最多 200 个确认属性 |
| 实际 HTTP 请求 JSON | 192 KiB（含系统提示和目录） |
| HTTP 响应 | 512 KiB，cURL 写入回调越界立即中止 |
| 模型 content JSON | 64 KiB，32 层深度 |
| 网络 | HTTP/1.1；5 秒连接、90 秒总超时；HTTPS only；TLS peer/host 验证 |
| 目标 | 固定配置目标；禁止 redirect、代理、netrc |
| 请求次数 | 每个 generate 最多 1；错误不追加调用 |
| JSON | 单对象；拒绝 fence、尾随文字、重复键、对象/数组混淆、额外 schema 字段 |
| 模型输出 | 仅 assistant 文本；拒绝工具调用、非 stop finish、模型替换和未知证据 |

系统指令与资料 JSON 分为固定 system / user 消息。来源中的命令仅作为资料文本，无模型工具、HTTP 重定向或数据库写能力。文字进入后续界面仍必须按文本渲染；本包不提供可执行 HTML，也不把候选内容解释为代码或授权。

生产传输显式使用主代理已核验成功的 HTTP/1.1 POST 协议。此前一次请求只记录了稳定网络错误，未保留底层 errno，因此不能据此断言 HTTP/2 是失败根因。此兼容性设置不增加自动网络重试、不切换模型，也不改变令牌预算。

PHP 8.5 将 curl_close() 标记为弃用。在 Yii 将弃用警告转换为异常时，该调用可能把实际成功响应误报为网络失败。生产传输在 finally 中 unset 原生 CurlHandle，由对象生命周期释放资源。专用合成回归使用原生但未联网的 CurlHandle、命名空间内网络替身和 E_DEPRECATED → ErrorException 处理器，检查成功响应以及配置失败、执行异常路径的句柄释放。

2026-11-12 为适配已观察到的提供方综合生成延迟，总请求时限从 45 秒调整为 90 秒，连接时限仍为 5 秒。相对于异步 worker 的 120 秒租约，保留约 30 秒用于结果校验与安装；一次任务仍只有一次模型请求，失败后须由本人明确重试，令牌预算和全部输出校验保持不变。

稳定错误码包括 AI_NOT_CONFIGURED、AI_TRANSPORT_UNAVAILABLE、AI_INPUT_INVALID、AI_INPUT_TOO_LARGE、AI_TIMEOUT、AI_NETWORK_ERROR、AI_RESPONSE_TOO_LARGE、AI_AUTHENTICATION_FAILED、AI_RATE_LIMITED、AI_GATEWAY_UNAVAILABLE、AI_REDIRECT_REJECTED、AI_HTTP_ERROR、AI_PROVIDER_RESPONSE_INVALID、AI_MODEL_MISMATCH、AI_OUTPUT_TRUNCATED、AI_REFUSED、AI_OUTPUT_INVALID、AI_PROVIDER_ERROR。

## 本包验证

在项目根目录运行：

    backend/.runtime/php-mysql/bin/php -c backend/.runtime/php.ini backend/protected/modules/matcher-onboarding-ai/tests/unit/run.php

tests/unit/run.php 用合成 ModelTransport、临时 0600 合成配置和可注入 cURL executor 验证三类成功路径、非法字段/代码/证据、自由回答、隐私继承、原有确认值保护、JSON 攻击、HTTP/TLS/大小/超时选项、失败用量和脱敏。没有读取项目私有凭据，也没有真实网关调用。真实指定模型的合成资料验收由主代理单独执行并在专项报告记录，不能用本包合成测试冒充真实提供商验收。
