# 真实资料画像评估集 v1

已收集并核对 10 组本人公开简历与同账号项目，另有三组长篇模拟对话。真实简历没有改写成模拟人物；对话也不冒充真实人物的发言。

这里的真实性指本人账号发布、简历中的自我标识和项目账号可以对应，不等于已经对学历、任职或成果做独立背景调查。资料包含历史版本，不把旧简历中的 present 自动解释为今天仍然任职。

本机采集记录日期：2026-11-11。十份主简历合计 112,708 字符，最长 PDF 为 7 页。TeX 字符数包含排版与注释，不能当作纯正文长度。多版本和中英文内容不重复计入主简历合计。

## 十组来源

| 编号 | 账号 | 完整简历 | 对应项目 | 材料覆盖 | 作者提交样本数 |
| --- | --- | --- | --- | --- | ---: |
| 01 | [mschrimpf](https://github.com/mschrimpf) | [6 页 PDF](https://github.com/mschrimpf/cv/blob/d91d748ec2951fe1c19989d11e15b6a7866d6ffd/main.pdf) | [dbimpl](https://github.com/mschrimpf/dbimpl/tree/fa55a43526e65e6ef230c7258889e9ad4523b680) | 英文；计算神经科学、研究履历与系统课程项目 | 3 |
| 02 | [liweitianux](https://github.com/liweitianux) | [4 页 PDF](https://github.com/liweitianux/resume/blob/b3ccb2ec858f052903ef735300b67f701be266a7/resume-zh%2Ben.pdf) | [fg21sim](https://github.com/liweitianux/fg21sim/tree/755c9131efb8274cd528ff0802c76dfaa1cdb2dd) | 中英双语；天文研究与科学计算 | 3 |
| 03 | [cies](https://github.com/cies) | [2 页 PDF](https://github.com/cies/resume/blob/5f4a266300a5c4e2830f4aa4cc57921e5b77d6ae/cies-breijs-resume.pdf) | [htoml](https://github.com/cies/htoml/tree/f776a75eda018b6885bfc802757cd3ea3d26c7d7) | 英文；软件工程与函数式编程 | 3 |
| 04 | [dpseidel](https://github.com/dpseidel) | [14,415 字符 TEX 原文](https://github.com/dpseidel/resume/blob/d7bb852981e2541d51308f0add52e95f81b051d0/main.tex) | [stmove](https://github.com/dpseidel/stmove/tree/a6a957c496fa78d577746b1a510365a38e21d5e5) | 英文；生态学、数据分析与 R | 3 |
| 05 | [vaibhavsagar](https://github.com/vaibhavsagar) | [2,540 字符 MD 原文](https://github.com/vaibhavsagar/resume/blob/7851d264e1d59366128fe280fcb31059001a0644/resume.md) | [duffer](https://github.com/vaibhavsagar/duffer/tree/bad9c6c6cf09f717e22d3d65f95564236896d610) | 英文；数据工程与 Haskell | 3 |
| 06 | [FlorentRevest](https://github.com/FlorentRevest) | [1 页 PDF](https://github.com/FlorentRevest/CV/blob/b9afe04fda0c6d299c4cf5e5a809dd9770fa5897/cv.pdf) | [Raspcopter](https://github.com/FlorentRevest/Raspcopter/tree/74215794245c5c0b3c83bc6ae2460064c821b701) | 英文；嵌入式与系统开发 | 3 |
| 07 | [trallard](https://github.com/trallard) | [4 页 PDF](https://github.com/trallard/MyAwesomeCV/blob/7e82fb99394dc5cff896ac9c75f556b1008adecc/TaniaAllard-CV-long.pdf) | [airflow-tutorial](https://github.com/trallard/airflow-tutorial/tree/eb16a3c2cebc898bc439058598f912c31d54eecd) | 英文；研究软件、数据流程与社区经历 | 3 |
| 08 | [rainsworth](https://github.com/rainsworth) | [7 页 PDF](https://github.com/rainsworth/awesomeCV/blob/16374a2c78e5f57c70911cfd03c55a72d1c4c3de/resume.pdf) | [eMERLIN-IRIS](https://github.com/rainsworth/eMERLIN-IRIS/tree/c262c4214ed1b1697e098caa5ff03ced2c8b65b9) | 英文；天文研究、论文与科研协作 | 3 |
| 09 | [wu-kan](https://github.com/wu-kan) | [12,239 字符 TEX 原文](https://github.com/wu-kan/CV/blob/04ba35e52fdb9b32dffafa047fe3b1d8ee966446/main.tex) | [HPL-AI](https://github.com/wu-kan/HPL-AI/tree/2eb76d856d9ed2bd565014e1004d735755e061c9) | 中英双语；高性能计算与科研项目 | 0 |
| 10 | [sc932](https://github.com/sc932) | [7 页 PDF](https://github.com/sc932/resume/blob/0b155a4bdf13fb86a0fd4662b849ddb5d713df94/ScottClarkCV.pdf) | [ALE](https://github.com/sc932/ALE/tree/e7b0777f3b1b1eaaf280bd96452c63a59cc43683) | 英文；创业、优化算法与科研经历 | 2 |

作者提交查询最多取 3 条，只证明相应提交的可归因关系，不表示总贡献量，更不表示独立完成。`wu-kan/HPL-AI` 的账号过滤查询没有返回提交，已保留为归因缺口；不能据此断定没有贡献，也不能把整个 HPL 上游实现算作本人原创。

## 本地完整资料

原文位于 `../../.private/real-world-v1/编号-账号/`。每组包含 `resume/`、`project/`、`sample.json`、项目树及作者提交记录。原始资料只在本机被 Git 忽略的目录保存；公开索引不复制联系方式。

保存的是完整简历文件和选定项目文件的不可变快照，不是十个完整 Git 克隆。每个文件记录源 URL、固定提交、SHA-256、获取时间、字节数、字符数和解析方法。README 完整保存，代码与深层文档是明确选取的样本，不能声称审查了整个仓库。

公开原文保留原有权利与来源说明；本地研究采集不表示获得将他人履历作为产品注册资料或公开再分发的授权。未联系样本人物，未把他们放入任何活动候选池，未上传真实简历给外部模型。

## 可直接查看的结果

- [长篇输入与连续修改](长篇输入与连续修改.md)：三种不同进度的想法；每组首次输入超过 1,200 字符，后续包含局部修改、贡献纠正、定位转向和隐私调整。
- [基线输入损失](基线输入损失.md)：对十份真实 README 实际运行候选的纯上下文拼装方法，测量被截断多少；不是 LLM 效果评测。
- [机器可读用例](cases.json)：10 个真实资料抽取用例 + 3 个模拟多轮用例，所有模型运行状态均为 not_run。
- [来源清单](manifest.json)：固定提交、文件位置、身份对应依据、贡献证据与未解决限制。
- [本地完整性检查](validation.json)：数量、文件哈希、文本长度、权限和文档链接检查。

## 这批材料要求什么样的流程

输入已经详细时，先展示可核对的画像和想法草稿，只问影响当前决定的缺口。不能让所有人从固定问卷第一题重来；短卡片摘要、完整原文、可重复经历记录、来源与版本应分别保留。

长简历里的研究、工程、教学、组织与创业经历不能只压成技能标签；目标、实际成果、学习实践、团队贡献和未来意愿需要区分。一次只改合作偏好或展示范围，不应重置全局履历或隐式触发重抓。

本轮已完成数据与用例准备，并执行上下文容量检查。尚未运行真实模型的画像抽取、多轮修改、数据库写入或产品端到端测试，因此不宣称画像效果已经达标。

## 复核与补充

采集脚本位于 [collect_real_world_samples.py](../../scripts/collect_real_world_samples.py)，证据补充位于 [enrich_real_world_samples.py](../../scripts/enrich_real_world_samples.py)。运行 [build_real_world_evaluation.py](../../scripts/build_real_world_evaluation.py) 可离线重新核对本次快照、重建用例并复现上下文测量。

剔除记录：`hijiangtao/resume` 下载版本仍含姓名及 XXX 占位符，未计入十组；`geekplux/cv_resume` 为模板导向候选，未选入。模板工具可以用，但其中的示例人物不能冒充真实简历。
