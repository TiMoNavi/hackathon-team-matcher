# 简历资料导入

0.1.1 依赖 HumHub ≥ 1.19.4 与 matcher-user-profile ≥ 0.6.0。支持本人 PDF、DOCX、Markdown 与纯文本简历，使用本地 Python 文本解析；不调用模型。

本次补丁将明确字段映射规则共用到 P1 ExplicitTextCandidateMapper，ResumeCandidateMapper 保留原入口。原候选 ID、字段代码、解析与上传合同保持一致；必须先安装 P1 0.6.0，随后升级本模块。来源仍为本人私有，明确采纳后只进入普通资料草稿，确认后才按本人选择的范围展示。

测试入口为 tests/create_fixtures.py 和 tests/run.php，使用合成资料；不使用用户文件。Python 依赖和解析实现位于 runtime/。
