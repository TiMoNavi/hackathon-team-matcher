# 真实模型可见输出与测试对话原始记录

> 2026-11-12。测试用户与资料均为虚构；模型内容来自实际网关请求。这里只记录可见 assistant.content，不记录隐藏推理、凭据或请求头。完整发出 messages/schema 和候选摘要见同目录 live JSON。

[完整请求与诊断 JSON](dialogue-demo-live_2026-11-12.json)

## 项目补位：产品协调者找后端

### 模拟用户输入

~~~~text
我想做AI教育项目。我负责产品协调，这次更需要愿意承担后端开发的搭档，偏好异步沟通。请推荐合适的人。
~~~~

### 请求 1 · recommendation_interpretation

HTTP 200；finish_reason=stop；请求 9878 字节；usage={"prompt_tokens": 1171, "completion_tokens": 750, "total_tokens": 1921}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"status":"ready","conditions":[{"feature":"topics","operator":"similarity","value":"AI教育","strength":"soft","origin":"interpreted_draft"},{"feature":"needs","operator":"supply_demand","value":"后端开发","strength":"soft","origin":"interpreted_draft"},{"feature":"preferences","operator":"explicit_preference","value":"异步沟通","strength":"soft","origin":"interpreted_draft"},{"feature":"self_type","operator":"explicit_preference","value":"产品协调","strength":"soft","origin":"interpreted_draft"}],"question":null}
~~~~

### 请求 2 · recommendation_ranking

HTTP 200；finish_reason=length；请求 16379 字节；usage={"prompt_tokens": 7441, "completion_tokens": 1532, "total_tokens": 8973}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"items":[{"target_type":"person","id":"1001","evidence_ids":["e-4c2cf3ec59da55d7bdadb8b483390aed907e780ee92e3827
~~~~

### 请求 3 · recommendation_ranking

HTTP 200；finish_reason=stop；请求 16379 字节；usage={"prompt_tokens": 7440, "completion_tokens": 2846, "total_tokens": 10286}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"items":[{"target_type":"person","id":"1001","evidence_ids":["e-4c2cf3ec59da55d7bdadb8b483390aed907e780ee92e382738d3991b707f9416","e-f78a0ef5c410dfbc7876d5415914fa51b7199e17fe50f672dfb2e9c39a98b007","e-05257b84d0c81fcdf09b32a8088e5d9cb05e0df84c98739b179459c43ce42f45"]},{"target_type":"person","id":"1009","evidence_ids":["e-4b174a3dd4f992f70e8112aa597a6844949059cf3f3ac9a48f7e6a9a209f1fc3","e-47b02992673cdbcc6b2d325bd0a067c4e03d16e5813e281822be4185f1e8de93","e-c5afe5179a0968d421002a25c3c03717ae62a6363518063a0645736bbab823c3"]},{"target_type":"person","id":"1011","evidence_ids":["e-300e1b85feb9a6887280813087960d06b0af5c7f312cacc5df2cde41426b1701","e-7ff774a561ea0cc2259d9e8c0e95aec81d905dbabea9c0af86dc5381f8a343e8","e-95ab49eafce3766d8b5edb4c6312c2e0f9dbbc1f0892be13127b4e445c7b0efb"]},{"target_type":"person","id":"1036","evidence_ids":["e-37f983623c8e62023886e6aad3c90d32a8139aaff164d2328e18cf3ab30bc66c","e-dd3adc4e8d67344ee72a28d0f4d390f8cc1e9d50351a8094dc9df7dc94ca9f70"]},{"target_type":"person","id":"1013","evidence_ids":["e-f6f34691a2d6fc465680358654c0b3335afcba75251b316324cb06a69e7ed4b7"]}]}
~~~~

最终服务状态：completed；错误：None。

后端核验结果（不是模型自由回复）：

~~~~text
{
  "run_id": "e7d830d087ff085e60ea87283dcfe49aca490cdb9a438ca7",
  "version": 10,
  "interaction_status": "completed",
  "execution_status": "succeeded",
  "applicability": "current",
  "model_calls_used": 3,
  "clarification_round": 0,
  "search_calls_used": 1,
  "repair_used": true,
  "question": null,
  "items": [
    {
      "id": "1001",
      "display_name": "虚构·林澄",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.8627450980392157,
      "ai_rank": 1,
      "evidence_ids": [
        "e-4c2cf3ec59da55d7bdadb8b483390aed907e780ee92e382738d3991b707f9416",
        "e-f78a0ef5c410dfbc7876d5415914fa51b7199e17fe50f672dfb2e9c39a98b007",
        "e-05257b84d0c81fcdf09b32a8088e5d9cb05e0df84c98739b179459c43ce42f45"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：offers=\"后端开发\"。",
        "本次排序参考已确认事实：topics=\"AI教育\"。",
        "本次排序参考已确认事实：preferences=\"先做原型\"。",
        "本次排序参考已确认事实：preferences=\"异步沟通\"。"
      ]
    },
    {
      "id": "1009",
      "display_name": "虚构·顾栎",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.8605945604048072,
      "ai_rank": 2,
      "evidence_ids": [
        "e-4b174a3dd4f992f70e8112aa597a6844949059cf3f3ac9a48f7e6a9a209f1fc3",
        "e-47b02992673cdbcc6b2d325bd0a067c4e03d16e5813e281822be4185f1e8de93",
        "e-c5afe5179a0968d421002a25c3c03717ae62a6363518063a0645736bbab823c3"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：offers=\"后端开发\"。",
        "本次排序参考已确认事实：topics=\"AI教育\"。",
        "本次排序参考已确认事实：preferences=\"先做计划\"。",
        "本次排序参考已确认事实：preferences=\"异步沟通\"。"
      ]
    },
    {
      "id": "1011",
      "display_name": "虚构·沈禾",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.8585122938064116,
      "ai_rank": 3,
      "evidence_ids": [
        "e-300e1b85feb9a6887280813087960d06b0af5c7f312cacc5df2cde41426b1701",
        "e-7ff774a561ea0cc2259d9e8c0e95aec81d905dbabea9c0af86dc5381f8a343e8",
        "e-95ab49eafce3766d8b5edb4c6312c2e0f9dbbc1f0892be13127b4e445c7b0efb"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：offers=\"后端开发\"。",
        "本次排序参考已确认事实：topics=\"AI教育\"。",
        "本次排序参考已确认事实：preferences=\"异步沟通\"。",
        "本次排序参考已确认事实：topics=\"开源\"。"
      ]
    },
    {
      "id": "1036",
      "display_name": "虚构·金笙",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.7766979255470304,
      "ai_rank": 4,
      "evidence_ids": [
        "e-37f983623c8e62023886e6aad3c90d32a8139aaff164d2328e18cf3ab30bc66c",
        "e-dd3adc4e8d67344ee72a28d0f4d390f8cc1e9d50351a8094dc9df7dc94ca9f70"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：offers=\"后端开发\"。",
        "本次排序参考已确认事实：topics=\"AI教育\"。"
      ]
    },
    {
      "id": "1013",
      "display_name": "虚构·白露",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.6808963585434175,
      "ai_rank": 5,
      "evidence_ids": [
        "e-f6f34691a2d6fc465680358654c0b3335afcba75251b316324cb06a69e7ed4b7"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：topics=\"AI教育\"。"
      ]
    }
  ],
  "error": null,
  "can_use_filters": false
}
~~~~

## 兴趣交友：音乐与徒步

### 模拟用户输入

~~~~text
想认识同样喜欢音乐和徒步的朋友，平时更偏好异步沟通。
~~~~

### 请求 4 · recommendation_interpretation

HTTP 200；finish_reason=stop；请求 9810 字节；usage={"prompt_tokens": 1157, "completion_tokens": 399, "total_tokens": 1556}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"status":"ready","conditions":[{"feature":"topics","operator":"similarity","value":["音乐","徒步"],"strength":"soft","origin":"interpreted_draft"},{"feature":"preferences","operator":"explicit_preference","value":["异步沟通"],"strength":"soft","origin":"interpreted_draft"}],"question":null}
~~~~

### 请求 5 · recommendation_ranking

HTTP 200；finish_reason=stop；请求 8173 字节；usage={"prompt_tokens": 3347, "completion_tokens": 1774, "total_tokens": 5121}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"items":[{"target_type":"person","id":"1017","evidence_ids":["e-aecd27bcee64c7971e23025e3da63d2f5cf326d6ed05237c3bf7f9f7d8c73c4b","e-b2ba23931dd38d1f21862f34fa685ffbb995caf8f467d1e7fea3820b6999f419"]},{"target_type":"person","id":"1023","evidence_ids":["e-7521f235a65ee651d4c4d7fa1e11c6d284dbcd7859341fef389e11388e0a7491","e-b0b4322b56d892115de7c25d2be6b0e578f09d04b698622a76fb1418c282a6b4"]},{"target_type":"person","id":"1032","evidence_ids":["e-2acf7df74aa3267826f33bab31ac04795ff664f892efa1cdee2b41dfd5578f90","e-0c9f7ee823d95fe0f3c91bc14d17c28ff16b7b5644c8cc49f123495d167479b1"]},{"target_type":"person","id":"1008","evidence_ids":["e-9712a2927105c0ccdd82a49310bc818ee31386a0b19411f03b3524e0c5ce0c2b","e-d4fdcfafcdf8c2c8b23cce11720d1872c86a2de4cc3ac8996ac31f36e99c1d1b"]},{"target_type":"person","id":"1010","evidence_ids":["e-f5f80a7f2283701ee5f455d7bfb726c5d569af06284ccab08c20f2e25d610237","e-43689191075c6f45e59895fe0ff2f9fd04c9ef8b9aeba73a5c1bda25cc34202a"]}]}
~~~~

最终服务状态：completed；错误：None。

后端核验结果（不是模型自由回复）：

~~~~text
{
  "run_id": "561b133c0c3ea4fae2f8efccf19b63c190e26018dd9e3338",
  "version": 7,
  "interaction_status": "completed",
  "execution_status": "succeeded",
  "applicability": "current",
  "model_calls_used": 2,
  "clarification_round": 0,
  "search_calls_used": 1,
  "repair_used": false,
  "question": null,
  "items": [
    {
      "id": "1017",
      "display_name": "虚构·秦音",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.6533333333333332,
      "ai_rank": 1,
      "evidence_ids": [
        "e-aecd27bcee64c7971e23025e3da63d2f5cf326d6ed05237c3bf7f9f7d8c73c4b",
        "e-b2ba23931dd38d1f21862f34fa685ffbb995caf8f467d1e7fea3820b6999f419"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：topics=\"音乐\"。",
        "本次排序参考已确认事实：preferences=\"先做原型\"。",
        "本次排序参考已确认事实：preferences=\"异步沟通\"。",
        "本次排序参考已确认事实：topics=\"开源\"。"
      ]
    },
    {
      "id": "1023",
      "display_name": "虚构·徐沐",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.6511827956989247,
      "ai_rank": 2,
      "evidence_ids": [
        "e-7521f235a65ee651d4c4d7fa1e11c6d284dbcd7859341fef389e11388e0a7491",
        "e-b0b4322b56d892115de7c25d2be6b0e578f09d04b698622a76fb1418c282a6b4"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：topics=\"音乐\"。",
        "本次排序参考已确认事实：preferences=\"先做计划\"。",
        "本次排序参考已确认事实：preferences=\"异步沟通\"。",
        "本次排序参考已确认事实：topics=\"开源\"。"
      ]
    },
    {
      "id": "1032",
      "display_name": "虚构·虞声",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.649100529100529,
      "ai_rank": 3,
      "evidence_ids": [
        "e-2acf7df74aa3267826f33bab31ac04795ff664f892efa1cdee2b41dfd5578f90",
        "e-0c9f7ee823d95fe0f3c91bc14d17c28ff16b7b5644c8cc49f123495d167479b1"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：topics=\"音乐\"。",
        "本次排序参考已确认事实：preferences=\"异步沟通\"。"
      ]
    },
    {
      "id": "1008",
      "display_name": "虚构·苏砚",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.40512820512820513,
      "ai_rank": 4,
      "evidence_ids": [
        "e-9712a2927105c0ccdd82a49310bc818ee31386a0b19411f03b3524e0c5ce0c2b",
        "e-d4fdcfafcdf8c2c8b23cce11720d1872c86a2de4cc3ac8996ac31f36e99c1d1b"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：topics=\"音乐\"。",
        "本次排序参考已确认事实：preferences=\"先做原型\"。",
        "本次排序参考已确认事实：preferences=\"当面讨论\"。",
        "本次排序参考已确认事实：topics=\"AI教育\"。"
      ]
    },
    {
      "id": "1010",
      "display_name": "虚构·叶寻",
      "name_source": "synthetic display mapping; not a production identity projection",
      "rule_score": 0.4032323232323232,
      "ai_rank": 5,
      "evidence_ids": [
        "e-f5f80a7f2283701ee5f455d7bfb726c5d569af06284ccab08c20f2e25d610237",
        "e-43689191075c6f45e59895fe0ff2f9fd04c9ef8b9aeba73a5c1bda25cc34202a"
      ],
      "backend_reasons": [
        "本次排序参考已确认事实：topics=\"徒步\"。",
        "本次排序参考已确认事实：preferences=\"先做原型\"。",
        "本次排序参考已确认事实：preferences=\"当面讨论\"。",
        "本次排序参考已确认事实：topics=\"AI教育\"。",
        "本次排序参考已确认事实：topics=\"公益\"。"
      ]
    }
  ],
  "error": null,
  "can_use_filters": false
}
~~~~

## 先澄清再寻找商业搭档

### 模拟用户输入

~~~~text
我想找个合适的搭档，但还没想清楚该按什么条件找。
~~~~

### AI 实际澄清问题

~~~~text
你想优先按哪种方向筛选搭档？
~~~~

选项：互补的专业技能 / 共同感兴趣的话题 / 当前具体的合作需求

### 模拟用户输入

~~~~text
当前具体的合作需求。我想做AI教育项目，我来负责产品协调，想找愿意承担商业拓展的人，平时偏好异步沟通。
~~~~

### 请求 6 · recommendation_interpretation

HTTP 200；finish_reason=stop；请求 9804 字节；usage={"prompt_tokens": 1157, "completion_tokens": 220, "total_tokens": 1377}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"status":"clarification","conditions":[],"question":{"text":"你想优先按哪种方向筛选搭档？","options":["互补的专业技能","共同感兴趣的话题","当前具体的合作需求"]}}
~~~~

### 请求 7 · recommendation_interpretation

HTTP 200；finish_reason=stop；请求 10030 字节；usage={"prompt_tokens": 1223, "completion_tokens": 899, "total_tokens": 2122}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"status":"ready","conditions":[{"feature":"topics","operator":"similarity","value":["AI教育"],"strength":"soft","origin":"interpreted_draft"},{"feature":"needs","operator":"supply_demand","value":["商业拓展"],"strength":"soft","origin":"interpreted_draft"},{"feature":"preferences","operator":"explicit_preference","value":["异步沟通"],"strength":"soft","origin":"interpreted_draft"}],"question":null}
~~~~

### 请求 8 · recommendation_ranking

HTTP 200；finish_reason=length；请求 16015 字节；usage={"prompt_tokens": 7303, "completion_tokens": 1532, "total_tokens": 8835}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"items":[{"target_type":"person","id":"1014","evidence_ids":["e-2f17a85383126d4dcf4b14a8b540c1c4af08f70efe1ef
~~~~

### 请求 9 · recommendation_ranking

HTTP 200；finish_reason=length；请求 16015 字节；usage={"prompt_tokens": 7303, "completion_tokens": 1532, "total_tokens": 8835}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"items":[{"target_type":"person","id":"1014","evidence_ids":["e-2f17a85383126d4dcf4b14a8b540c1c4af08f7
~~~~

最终服务状态：failed；错误：invalid_model_output。

后端核验结果（不是模型自由回复）：

~~~~text
{
  "run_id": "87d53dcde078ee1647c0da9f7b77f2105913448ae4711b23",
  "version": 14,
  "interaction_status": "failed",
  "execution_status": "failed",
  "applicability": "current",
  "model_calls_used": 4,
  "clarification_round": 1,
  "search_calls_used": 1,
  "repair_used": true,
  "question": null,
  "items": [],
  "error": "invalid_model_output",
  "can_use_filters": true
}
~~~~

## 没有匹配证据时真实返回不足

### 模拟用户输入

~~~~text
我想找对深海考古有共同兴趣、愿意做水下声呐的搭档。
~~~~

### 请求 10 · recommendation_interpretation

HTTP 200；finish_reason=stop；请求 9807 字节；usage={"prompt_tokens": 1161, "completion_tokens": 836, "total_tokens": 1997}。

模型可见输出原文（截断输出也原样保留）：

~~~~text
{"status":"ready","conditions":[{"feature":"topics","operator":"similarity","value":["深海考古"],"strength":"soft","origin":"interpreted_draft"},{"feature":"skills","operator":"similarity","value":["水下声呐"],"strength":"soft","origin":"interpreted_draft"}],"question":null}
~~~~

最终服务状态：completed；错误：None。

后端核验结果（不是模型自由回复）：

~~~~text
{
  "run_id": "244023b44e3ac6cc33e4757e4ea65d4170a23d55c6c50711",
  "version": 5,
  "interaction_status": "completed",
  "execution_status": "succeeded",
  "applicability": "current",
  "model_calls_used": 1,
  "clarification_round": 0,
  "search_calls_used": 1,
  "repair_used": false,
  "question": null,
  "items": [],
  "error": null,
  "can_use_filters": false
}
~~~~
