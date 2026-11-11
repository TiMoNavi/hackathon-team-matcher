(function () {
    'use strict';
    function node(tag, attrs, text) {
        var n = document.createElement(tag);
        Object.entries(attrs || {}).forEach(function (pair) { n.setAttribute(pair[0], pair[1]); });
        if (text !== undefined) { n.textContent = String(text); }
        return n;
    }
    window.MatcherProfileSources = {mount: function (root, bridge) {
        var holder = root.querySelector('#onboarding-sources');
        var state = {capabilities: {}, sources: [], current: null, message: '', loaded: false};
        function button(label, id, callback) {
            var b = node('button', {type: 'button', class: 'btn btn-default', 'data-source-action': id}, label);
            b.addEventListener('click', function () { bridge.action(callback); });
            return b;
        }
        function sourcePath(source) { return '/me/profile/sources/' + encodeURIComponent(source.id); }
        function labelFor(key) {
            var profile = bridge.session().profiles.global;
            var field = (profile.field_definitions || []).find(function (f) { return f.key === key; });
            return field ? field.label : key;
        }
        async function reload() {
            var responses = await Promise.all([bridge.api('/me/profile/source-capabilities'), bridge.api('/me/profile/sources')]);
            state.capabilities = responses[0].readers || {};
            state.sources = responses[1].sources || [];
            state.loaded = true;
            if (state.current) {
                var present = state.sources.find(function (s) { return s.id === state.current.id && s.status !== 'deleted'; });
                state.current = present ? await bridge.api(sourcePath(present)) : null;
            }
            render();
        }
        async function receive(source) {
            state.current = source;
            await reload();
            state.message = source.status === 'ready' ? '资料已整理为本人候选。选择想带入的内容，再进入核对页。' : '本次读取未完成，可查看状态后重试，或继续手动填写。';
            render();
        }
        async function importGithub() {
            await bridge.save();
            await receive(await bridge.api('/me/profile/sources', 'POST', {kind: 'github'}));
        }
        async function upload(file, source) {
            if (!file) { throw new Error('请先选择一份 PDF、DOCX、MD 或 TXT 简历。'); }
            await bridge.save();
            var form = new FormData(); form.append('file', file);
            if (source) { form.append('expected_version', String(source.version)); }
            await receive(await bridge.api(source ? sourcePath(source) + '/refresh' : '/me/profile/sources/resume', 'POST', form));
        }
        function renderCurrent() {
            var source = state.current; if (!source) { return; }
            var box = node('section', {class: 'onboarding-source-detail', 'data-source-id': source.id});
            box.append(node('h4', {}, source.label || (source.kind === 'github' ? 'GitHub 公开资料' : '简历资料')));
            var snapshot = source.snapshot;
            if (source.status !== 'ready' || !snapshot) {
                var code = source.last_job && source.last_job.error_code;
                box.append(node('p', {}, source.status === 'running' ? '正在处理，请稍后重新读取状态。' : '本次来源尚未就绪。' + (code ? ' 状态：' + code : '')));
                box.append(button('重新读取状态', 'reload-source', async function () { state.current = await bridge.api(sourcePath(source)); render(); }));
            } else {
                if (snapshot.canonical_url && snapshot.canonical_url.startsWith('https://github.com/')) {
                    box.append(node('a', {href: snapshot.canonical_url, target: '_blank', rel: 'noopener noreferrer'}, snapshot.canonical_url));
                }
                var details = node('details', {class: 'onboarding-source-text'});
                details.append(node('summary', {}, '查看结构化文本与来源段落（仅本人）'));
                var text = node('pre', {'data-source-raw-text': source.id}, snapshot.raw_text || ''); details.append(text);
                (snapshot.sections || []).forEach(function (section) {
                    var part = node('section', {'data-source-section': section.id});
                    part.append(node('strong', {}, section.label || section.id), node('p', {}, section.text));
                    details.append(part);
                });
                box.append(details);
                var candidates = snapshot.candidates || [];
                box.append(node('p', {}, candidates.length ? '勾选要带入核对草稿的条目。已有内容会保留，确认前不会公开。' : '原文已保存。目前没有可直接映射的明确字段，可以参考原文手动补充。'));
                var checks = [];
                candidates.forEach(function (candidate) {
                    var item = node('label', {class: 'onboarding-source-candidate'});
                    var checkbox = node('input', {type: 'checkbox', value: candidate.id, 'data-source-candidate': candidate.id});
                    checkbox.checked = true; checks.push(checkbox);
                    var content = node('span');
                    content.append(node('strong', {}, labelFor(candidate.key)), node('span', {class: 'onboarding-source-value'}, bridge.pretty(candidate.value)));
                    if (candidate.evidence && candidate.evidence.length) { content.append(node('small', {}, '来源段落：' + candidate.evidence.join('、'))); }
                    item.append(checkbox, content); box.append(item);
                });
                if (candidates.length) {
                    box.append(button('将选中内容放入核对草稿', 'apply-source', async function () {
                        var selected = checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
                        if (!selected.length) { throw new Error('请至少选择一项，或直接继续手动填写。'); }
                        await bridge.save();
                        var draft = bridge.session().input_drafts.global;
                        var result = await bridge.api('/me/profile/extractions', 'POST', {source_id: source.id, expected_version: source.version, draft_id: draft.id, expected_draft_version: draft.draft_version, candidate_ids: selected});
                        await bridge.reload();
                        var count = Array.isArray(result.applied) ? result.applied.length : Number(result.applied || 0);
                        state.message = '候选已处理，新增 ' + count + ' 项到本轮核对草稿。已有内容与重复项保持原状，可在下一步查看和修改。';
                        render();
                    }));
                }
            }
            var actions = node('div', {class: 'onboarding-actions'});
            if (source.kind === 'github') {
                actions.append(button('主动重新读取 GitHub', 'refresh-source', async function () { await bridge.save(); await receive(await bridge.api(sourcePath(source) + '/refresh', 'POST', {expected_version: source.version})); }));
            } else {
                var replace = node('input', {type: 'file', accept: '.pdf,.docx,.md,.txt', 'aria-label': '选择同一简历文件以重试', 'data-source-replacement': source.id});
                actions.append(replace, button('重新解析这份文件', 'refresh-source', function () { return upload(replace.files[0], source); }));
            }
            actions.append(button('删除这份来源', 'delete-source', async function () {
                if (!window.confirm('删除这份私有来源原文和未采用结果？已确认的个人资料仍可在普通资料页管理。')) { return; }
                await bridge.save();
                await bridge.api(sourcePath(source), 'DELETE', {expected_version: source.version});
                state.current = null; await bridge.reload(); await reload();
                state.message = '来源已删除。'; render();
            }));
            box.append(actions); holder.append(box);
        }
        function render() {
            holder.hidden = false; holder.replaceChildren();
            holder.append(node('h3', {}, '先导入你已有的资料'));
            holder.append(node('p', {class: 'onboarding-note'}, '原文和候选仅自己可见。核对后再决定哪些内容展示给别人。'));
            if (!state.loaded) { holder.append(node('p', {}, '正在检查资料来源…')); return; }
            var github = state.capabilities.github || {}, resume = state.capabilities.resume || {};
            var area = node('div', {class: 'onboarding-source-options'});
            var gh = node('section'); gh.append(node('h4', {}, 'GitHub'));
            if (github.available && github.linked) {
                var existing = state.sources.some(function (s) { return s.kind === 'github' && s.status !== 'deleted'; });
                gh.append(node('p', {}, '已识别本人 GitHub 登录关联，无需填写用户名或主页。'));
                if (!existing) { gh.append(button('读取我的公开 GitHub 资料', 'import-github', importGithub)); }
                else { gh.append(node('p', {}, '已保存的来源可继续使用；再次登录不会自动重新抓取。')); }
            } else {
                gh.append(node('p', {}, github.configured === false ? '当前预览尚未配置 GitHub 登录。可以先上传简历或手动填写。' : '尚未关联 GitHub。关联后可直接识别本人账号。'));
                if (github.login_url && github.login_url.startsWith('/')) { gh.append(node('a', {href: github.login_url, class: 'btn btn-default'}, '关联 GitHub')); }
            }
            var cv = node('section'); cv.append(node('h4', {}, '简历'));
            if (resume.available) {
                var file = node('input', {type: 'file', accept: '.pdf,.docx,.md,.txt', id: 'onboarding-resume-file', 'aria-label': '选择简历文件'});
                cv.append(node('p', {}, '支持有文字层的 PDF、DOCX、MD、TXT。'), file, button('解析这份简历', 'upload-resume', function () { return upload(file.files[0]); }));
            } else { cv.append(node('p', {}, '简历解析当前不可用，可继续手动填写。')); }
            area.append(gh, cv); holder.append(area);
            var list = node('div', {class: 'onboarding-actions', 'data-source-list': 'true'});
            state.sources.filter(function (s) { return s.status !== 'deleted'; }).forEach(function (s) {
                list.append(button((s.kind === 'github' ? 'GitHub' : '简历') + ' · ' + (s.label || '已保存来源') + ' · v' + s.version, 'open-source', async function () { await bridge.save(); state.current = await bridge.api(sourcePath(s)); render(); }));
            });
            holder.append(list);
            if (state.message) { holder.append(node('p', {role: 'status', id: 'onboarding-source-status'}, state.message)); }
            renderCurrent();
        }
        return {enter: async function (automaticFirstImport) {
            if (!bridge.enabled || !bridge.session() || bridge.session().stage !== 'materials') { return; }
            await reload();
            var gh = state.capabilities.github || {};
            if (automaticFirstImport && gh.available && gh.linked && gh.imported_before === false && !state.sources.some(function (s) { return s.kind === 'github'; })) { await importGithub(); }
        }};
    }};
})();
