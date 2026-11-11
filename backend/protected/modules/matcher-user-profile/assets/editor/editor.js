(function () {
    'use strict';
    var current = null;
    var labels = {
        code: '标识', label: '名称', note: '补充说明', self_level: '本人水平', traits: '性格特点', self_description: '做事风格自述',
        codes: '偏好标签', free_text: '自由补充', school: '学校', major: '专业', degree: '学历', summary: '经历说明',
        start: '开始日期', end: '结束日期', value: '内容', precision: '日期精度', title: '名称', role: '个人角色',
        contribution: '个人贡献', tech_codes: '相关技术', links: '作品链接', outcome: '成果', organization: '单位或组织',
        issuer: '主办方', date: '获得日期', description: '说明', url: '链接地址', project_ref: '关联项目',
        file_ref: '二维码', role_codes: '需要的角色', skill_codes: '相关技能', hours_min: '最少小时数', hours_max: '最多小时数',
        period: '投入周期', starts_at: '开始时间（含时区）', ends_at: '结束时间（含时区）', timezone: '时区',
        mode: '参与方式', location_label: '本次参与地点'
    };
    var choices = {
        authenticated: '登录用户可见', friends: '好友可见', private: '仅自己可见',
        under_18: '18 岁以下', '18_24': '18–24 岁', '25_34': '25–34 岁', '35_44': '35–44 岁', '45_54': '45–54 岁', '55_plus': '55 岁及以上',
        learning: '学习中', working: '能够实践', proficient: '熟练', expert: '精通', basic: '基础', conversational: '日常交流', fluent: '流利', native: '母语',
        year: '年', month: '年月', day: '天', week: '周', event: '整个 Space 活动', onsite: '现场', online: '线上', hybrid: '现场与线上结合'
    };
    var groups = [
        ['基本资料', ['real_name', 'age_range', 'headline', 'bio', 'city', 'timezone', 'language']],
        ['性格与长期协作偏好', ['personality', 'mbti', 'collaboration_preference', 'communication_preference', 'seeking']],
        ['能力与兴趣', ['direction', 'skill', 'role', 'interest']],
        ['经历与作品', ['education', 'project', 'work_experience', 'award', 'portfolio_link']],
        ['联系方式', ['contact_wechat', 'contact_wechat_qr', 'contact_qq', 'contact_phone', 'contact_email', 'contact_other']],
        ['本次 Space 的目标与协作', ['event_goal', 'event_seeking', 'event_role', 'event_contribution', 'event_contact_preference', 'event_constraint']],
        ['本次 Space 的投入与参与安排', ['event_time_commitment', 'event_availability', 'event_collaboration_mode', 'event_presence']]
    ];
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    function node(tag, attrs, text) {
        var result = document.createElement(tag);
        Object.entries(attrs || {}).forEach(function (entry) {
            if (entry[0] === 'class') { result.className = entry[1]; }
            else if (entry[0] === 'hidden') { result.hidden = !!entry[1]; }
            else { result.setAttribute(entry[0], entry[1]); }
        });
        if (text !== undefined) { result.textContent = String(text); }
        return result;
    }
    function button(text, action, attributes) {
        var result = node('button', Object.assign({type: 'button', class: 'btn btn-default btn-sm'}, attributes || {}), text);
        result.addEventListener('click', action); return result;
    }
    function uuid() { return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var n = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? n : (n & 3) | 8).toString(16); }); }
    function boot() {
        var root = document.getElementById('matcher-profile-editor');
        if (!root || root.dataset.initialized === 'yes') { return; }
        root.dataset.initialized = 'yes';
        var config = JSON.parse(root.dataset.editorConfig);
        var state = {root: root, config: config, scope: 'global', profile: null, draft: null, identity: null, records: [], baseline: [], deleted: new Set(), controls: new Map(), selected: new Set(), busy: false, dirty: false, identityDirty: false, sequence: 0};
        current = state;
        var byId = function (id) { return root.querySelector('#' + id); };
        var status = function (text) { byId('matcher-editor-status').textContent = text; };
        var errorBox = byId('matcher-editor-error');
        function showError(error) {
            var conflict = error.status === 409;
            var detail = error.details && error.details.errors ? error.details.errors.join('\n') : '';
            errorBox.textContent = (conflict ? '资料已在其他页面发生变化，本页输入仍保留。请核对后点击“重新读取”，再重新应用需要的修改。\n' : '') + error.message + (detail ? '\n' + detail : '');
            errorBox.hidden = false; status(conflict ? '版本冲突，尚未覆盖服务器资料。' : '操作未完成，请检查提示。');
        }
        function setBusy(value) {
            state.busy = value; root.setAttribute('aria-busy', value ? 'true' : 'false');
            root.querySelectorAll('button,input,textarea,select').forEach(function (element) {
                if (value) { element.dataset.wasDisabled = element.disabled ? 'yes' : 'no'; element.disabled = true; }
                else if (Object.prototype.hasOwnProperty.call(element.dataset, 'wasDisabled')) { element.disabled = element.dataset.wasDisabled === 'yes'; delete element.dataset.wasDisabled; }
            });
        }
        async function action(work) {
            if (state.busy) { return; }
            errorBox.hidden = true; setBusy(true);
            try { await work(); } catch (error) { showError(error); }
            finally { setBusy(false); }
        }
        async function request(path, options) {
            options = Object.assign({method: 'GET'}, options || {});
            var headers = Object.assign({'Accept': 'application/json'}, options.headers || {});
            if (options.method !== 'GET') {
                var csrf = document.querySelector('meta[name="csrf-token"]');
                if (!csrf) { throw new Error('页面验证信息已失效，请重新读取页面。'); }
                headers['X-CSRF-Token'] = csrf.content;
            }
            if (options.json !== undefined) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.json); delete options.json; }
            var response = await fetch(config.apiBase + path, Object.assign(options, {headers: headers, credentials: 'same-origin', cache: 'no-store'}));
            var body;
            try { body = await response.json(); } catch (_) { throw new Error('服务器暂时未返回可读取的结果，请稍后重试。'); }
            if (!response.ok || body.error) {
                var error = new Error(body.error && body.error.message ? body.error.message : '请求未完成。');
                error.status = response.status; error.code = body.error && body.error.code; error.details = body.error && body.error.details; throw error;
            }
            return body.data;
        }
        function query(extra) {
            var params = new URLSearchParams(extra || {});
            if (state.scope !== 'global') { params.set('space_id', state.scope.slice(6)); }
            return params.size ? '?' + params.toString() : '';
        }
        function profilePath() { return '/me/profile' + query(); }
        function draftPath(suffix) { return '/me/profile/drafts/' + encodeURIComponent(state.draft.id) + (suffix || '') + query(); }
        function mediaUrl(ref) { return config.apiBase + '/profile-media/' + encodeURIComponent(ref); }
        function definitions() { return (state.profile && state.profile.field_definitions) || []; }
        function definition(key) { return definitions().find(function (item) { return item.key === key; }); }
        function contentOf(item) { return {key: item.key, value: item.value, visibility: item.visibility, sort_order: item.sort_order}; }
        function capture() {
            state.controls.forEach(function (control, id) {
                var item = state.records.find(function (record) { return record._id === id; });
                if (item) { item.value = control.read(); item.visibility = control.visibility.value; }
            });
        }
        function markDirty() { state.dirty = true; status('有未保存修改。保存草稿后，可预览并逐条确认。'); }
        function resetRecords() {
            state.records = clone(state.draft ? state.draft.preview_attributes : state.profile.attributes).map(function (item) {
                item._id = item.attribute_id; return item;
            });
            state.baseline = clone(state.records); state.deleted.clear(); state.controls.clear(); state.dirty = false;
        }
        async function load() {
            var results = await Promise.all([request(profilePath()), request('/me')]);
            var nextProfile = results[0], nextDraft = null;
            if (nextProfile.editing_draft && nextProfile.editing_draft.id) {
                nextDraft = await request('/me/profile/drafts/' + encodeURIComponent(nextProfile.editing_draft.id) + query());
                if (nextDraft.status !== 'editing') { nextDraft = null; }
            }
            state.profile = nextProfile; state.draft = nextDraft; state.selected.clear();
            if (!state.identityDirty) { state.identity = results[1]; renderIdentity(); }
            byId('matcher-editor-identity').hidden = state.scope !== 'global';
            resetRecords(); render();
            status(state.draft ? '已恢复未确认草稿。请核对后选择本次确认内容。' : '资料已读取。所有普通字段均可选。');
            byId('matcher-preview-result').replaceChildren();
        }
        function renderIdentity() {
            byId('matcher-editor-identity').hidden = state.scope !== 'global';
            byId('matcher-nickname').value = state.identity.nickname || '';
            delete state.avatarPending;
            byId('matcher-avatar-file').value = '';
            var image = byId('matcher-avatar-preview'); image.hidden = !state.identity.avatar_ref;
            if (state.identity.avatar_ref) { image.src = mediaUrl(state.identity.avatar_ref); } else { image.removeAttribute('src'); }
        }
        function fieldControl(schema, value, path, fieldKey) {
            var container = node('div', {class: 'matcher-form-field'}), id = 'matcher-value-' + (++state.sequence);
            var property = path.split('.').pop(), title = labels[property] || (definition(fieldKey) || {}).label || property;
            var label = node('label', {for: id}, title); container.append(label);
            if (schema.type === 'object') {
                label.remove(); var fieldset = node('fieldset', {class: 'matcher-value-object'}), children = {};
                if (path.includes('.')) { fieldset.append(node('legend', {}, title)); }
                var hasLabelledCode = schema.properties.code && schema.properties.label;
                Object.entries(schema.properties).forEach(function (entry) {
                    if (hasLabelledCode && entry[0] === 'code') { return; }
                    var child = fieldControl(entry[1], value && value[entry[0]], path + '.' + entry[0], fieldKey);
                    children[entry[0]] = child; fieldset.append(child.element);
                });
                container.classList.add('matcher-form-field-wide'); container.append(fieldset);
                return {element: container, read: function () {
                    var result = {};
                    Object.entries(children).forEach(function (entry) { var child = entry[1].read(); if (child !== undefined) { result[entry[0]] = child; } });
                    if (hasLabelledCode && result.label) { result.code = value && value.code ? value.code : result.label.slice(0, 64); }
                    return Object.keys(result).length ? result : undefined;
                }};
            }
            if (schema.type === 'array') {
                var list = node('textarea', {id: id, class: 'form-control', 'data-property': path, rows: 3, placeholder: '每行一项'});
                list.value = Array.isArray(value) ? value.join('\n') : '';
                container.classList.add('matcher-form-field-wide'); container.append(list, node('small', {class: 'matcher-editor-small'}, '每行填写一项，可留空。'));
                return {element: container, read: function () { var result = list.value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean); return result.length ? result : undefined; }};
            }
            if (property === 'file_ref' && fieldKey === 'contact_wechat_qr') {
                var reference = value, upload = node('input', {type: 'file', id: id, accept: 'image/png,image/jpeg,image/webp', 'data-property': path});
                var picture = node('img', {class: 'matcher-qr-preview', alt: '微信二维码预览', hidden: !reference});
                if (reference) { picture.src = mediaUrl(reference); }
                upload.addEventListener('change', function () {
                    if (!upload.files[0]) { return; }
                    action(async function () {
                        var result = await uploadFile('/me/contact-qr', upload.files[0]); reference = result.file_ref;
                        picture.src = result.thumbnail_url || mediaUrl(reference); picture.hidden = false; markDirty();
                    });
                });
                container.append(upload, picture, node('small', {class: 'matcher-editor-small'}, '上传后保存草稿，再勾选确认。最多 5 MiB。'));
                return {element: container, read: function () { return reference || undefined; }};
            }
            var input;
            if (schema.enum || property === 'project_ref') {
                input = node('select', {id: id, class: 'form-control', 'data-property': path}); input.append(node('option', {value: ''}, '暂不填写'));
                if (schema.enum) { schema.enum.forEach(function (option) { input.append(node('option', {value: option}, choices[option] || option)); }); }
                else {
                    state.records.filter(function (item) { return item.key === 'project' && item.attribute_id; }).forEach(function (item) {
                        input.append(node('option', {value: item.attribute_id}, (item.value && item.value.title) || '项目'));
                    });
                    if (value && !Array.from(input.options).some(function (option) { return option.value === value; })) { input.append(node('option', {value: value}, '原关联项目（请核对）')); }
                }
            } else if (schema.type === 'string' && schema.maxLength > 500 && !schema.format) {
                input = node('textarea', {id: id, class: 'form-control', 'data-property': path, rows: fieldKey === 'bio' ? 5 : 3}); container.classList.add('matcher-form-field-wide');
            } else {
                var type = schema.type === 'number' || schema.type === 'integer' ? 'number' : schema.format === 'email' ? 'email' : schema.format === 'http-url' ? 'url' : 'text';
                input = node('input', {id: id, type: type, class: 'form-control', 'data-property': path});
                if (type === 'number') { input.step = schema.type === 'integer' ? '1' : 'any'; if (schema.minimum !== undefined) { input.min = schema.minimum; } }
                if (schema.format === 'date-time') { input.placeholder = '例如 2026-11-15T09:00:00+08:00'; }
                if (schema.format === 'partial-date') { input.placeholder = '例如 2024、2024-06 或 2024-06-15'; }
                if (schema.format === 'timezone') { input.placeholder = '例如 Asia/Shanghai'; }
                if (fieldKey === 'language' && property === 'code') { label.textContent = '语言（如 zh-CN、en）'; }
            }
            if (schema.maxLength) { input.maxLength = schema.maxLength; }
            input.value = value === undefined || value === null ? '' : String(value);
            container.append(input);
            return {element: container, read: function () {
                var result = input.value.trim();
                if (result === '') { return undefined; }
                return schema.type === 'number' || schema.type === 'integer' ? Number(result) : result;
            }};
        }
        function card(item, index) {
            var field = definition(item.key), container = node('fieldset', {class: 'matcher-field-card', 'data-record-id': item._id, 'data-field-key': item.key});
            container.append(node('legend', {}, field.label + (field.cardinality === 'many' ? ' ' + (index + 1) : '')));
            var control = fieldControl(field.value_schema, item.value, item.key, item.key); container.append(control.element);
            var footer = node('div', {class: 'matcher-field-footer'}), visibility = node('select', {class: 'form-control', 'aria-label': field.label + '展示范围', 'data-visibility': item._id});
            Object.entries({authenticated: choices.authenticated, friends: choices.friends, private: choices.private}).forEach(function (entry) { visibility.append(node('option', {value: entry[0]}, entry[1])); });
            visibility.value = item.visibility || field.default_visibility;
            if (!config.privacyEnabled) { visibility.disabled = true; }
            var visibilityLabel = node('label', {}, '展示范围'); visibilityLabel.append(visibility); footer.append(visibilityLabel);
            if (field.cardinality === 'many') {
                footer.append(button('上移', function () { reorder(item._id, -1); }, {'data-move': 'up', 'aria-label': '上移' + field.label}), button('下移', function () { reorder(item._id, 1); }, {'data-move': 'down', 'aria-label': '下移' + field.label}));
            }
            footer.append(button('删除此条', function () {
                capture(); state.records = state.records.filter(function (record) { return record._id !== item._id; });
                if (item.attribute_id) { state.deleted.add(item.attribute_id); } markDirty(); renderFields();
            }, {'data-delete-record': item._id}));
            container.append(footer);
            state.controls.set(item._id, {read: control.read, visibility: visibility});
            container.addEventListener('input', function () { container.classList.add('is-dirty'); markDirty(); });
            container.addEventListener('change', function () { container.classList.add('is-dirty'); markDirty(); });
            return container;
        }
        function reorder(id, direction) {
            capture(); var item = state.records.find(function (record) { return record._id === id; });
            var peers = state.records.filter(function (record) { return record.key === item.key; }).sort(function (a, b) { return a.sort_order - b.sort_order; });
            var index = peers.indexOf(item), other = peers[index + direction]; if (!other) { return; }
            var order = item.sort_order; item.sort_order = other.sort_order; other.sort_order = order;
            state.records.sort(function (a, b) { return a.sort_order - b.sort_order; }); markDirty(); renderFields();
        }
        function addRecord(field, value, visibility) {
            capture();
            if (field.cardinality === 'one' && state.records.some(function (item) { return item.key === field.key; })) { throw new Error('该字段已经存在，请编辑已有条目。'); }
            var order = Math.max(0, ...state.records.map(function (item) { return item.sort_order || 0; })) + 1;
            state.records.push({_id: 'new-' + uuid(), key: field.key, value: clone(value), visibility: visibility || field.default_visibility, sort_order: order});
            markDirty(); renderFields();
            var cards = root.querySelectorAll('[data-field-key="' + field.key + '"]');
            if (cards.length) { var target = cards[cards.length - 1]; target.closest('details').open = true; target.querySelector('input,textarea,select').focus(); }
        }
        function renderFields() {
            var holder = byId('matcher-editor-fields'), opened = new Map(Array.from(holder.querySelectorAll('details')).map(function (item) { return [item.dataset.group, item.open]; }));
            holder.replaceChildren(); state.controls.clear();
            groups.forEach(function (group) {
                var fields = group[1].map(definition).filter(Boolean); if (!fields.length) { return; }
                var details = node('details', {class: 'matcher-field-group', 'data-group': group[0]});
                details.open = opened.has(group[0]) ? opened.get(group[0]) : true;
                details.append(node('summary', {}, group[0]));
                fields.forEach(function (field) {
                    var section = node('section', {class: 'matcher-field-section', 'data-definition-key': field.key}), heading = node('div', {class: 'matcher-field-heading'});
                    heading.append(node('h3', {}, field.label + '（可选）'));
                    var records = state.records.filter(function (item) { return item.key === field.key; }).sort(function (a, b) { return a.sort_order - b.sort_order; });
                    if (field.cardinality === 'many' || !records.length) { heading.append(button('添加' + field.label, function () { try { addRecord(field); } catch (error) { showError(error); } }, {'data-add-field': field.key})); }
                    section.append(heading);
                    if (!records.length) { section.append(node('p', {class: 'matcher-editor-empty'}, '尚未填写')); }
                    records.forEach(function (item, index) { section.append(card(item, index)); });
                    details.append(section);
                });
                holder.append(details);
            });
        }
        function renderLegacy() {
            var legacy = state.profile.legacy_candidates || [], section = byId('matcher-editor-legacy'), holder = byId('matcher-legacy-items');
            section.hidden = !legacy.length; holder.replaceChildren();
            legacy.forEach(function (item) {
                var field = definition(item.key); if (!field) { return; }
                var entry = node('div', {class: 'matcher-legacy-item'}); entry.append(node('strong', {}, field.label)); appendValue(entry, item.value);
                entry.append(button('核对并加入草稿', function () { try { addRecord(field, item.value, item.visibility || 'private'); } catch (error) { showError(error); } }, {'data-adopt-legacy': item.key})); holder.append(entry);
            });
        }
        function renderPending() {
            var holder = byId('matcher-pending-items'); holder.replaceChildren(); var operations = state.draft ? state.draft.fields : [];
            if (!operations.length) { holder.append(node('p', {class: 'matcher-editor-empty'}, '目前没有已保存的待确认条目。')); }
            operations.forEach(function (operation) {
                var item = state.records.find(function (record) { return record.attribute_id === operation.attribute_id; }) || state.profile.attributes.find(function (record) { return record.attribute_id === operation.attribute_id; }) || {};
                var field = definition(operation.key || item.key), labelText = (operation.op === 'delete' ? '删除：' : '确认：') + (field ? field.label : '资料条目');
                if (operation.value && typeof operation.value === 'object') { labelText += ' ' + (operation.value.title || operation.value.label || operation.value.school || operation.value.organization || ''); }
                var wrapper = node('div', {class: 'matcher-pending-item'}), label = node('label'), checkbox = node('input', {type: 'checkbox', value: operation.attribute_id, 'data-confirm-id': operation.attribute_id});
                checkbox.checked = state.selected.has(operation.attribute_id);
                checkbox.addEventListener('change', function () { if (checkbox.checked) { state.selected.add(operation.attribute_id); } else { state.selected.delete(operation.attribute_id); } });
                label.append(checkbox, node('span', {}, labelText + (operation.op !== 'delete' ? ' · ' + choices[operation.visibility] : ''))); wrapper.append(label); holder.append(wrapper);
            });
            byId('matcher-editor-version').textContent = '资料修订 ' + state.profile.revision + (state.draft ? ' · 草稿版本 ' + state.draft.draft_version + ' · ' + operations.length + ' 条待确认变更' : ' · 尚无未确认草稿');
        }
        function render() {
            root.dataset.loadedScope = state.scope;
            byId('matcher-editor-scope-help').textContent = state.scope === 'global' ? '这些资料在不同 Space 中共用。' : '当前编辑所选 Space 的本次偏好；全局资料保持不变。';
            renderFields(); renderLegacy(); renderPending();
        }
        function operations() {
            capture(); var changes = [];
            state.records.forEach(function (item) {
                var original = state.baseline.find(function (record) { return record._id === item._id; });
                if (item.value === undefined) {
                    if (item.attribute_id) { throw new Error((definition(item.key) || {}).label + '已清空，请填写内容或点击“删除此条”。'); }
                    return;
                }
                if (!original || JSON.stringify(contentOf(item)) !== JSON.stringify(contentOf(original))) {
                    var change = contentOf(item); if (item.attribute_id) { change.attribute_id = item.attribute_id; } changes.push(change);
                }
            });
            state.deleted.forEach(function (id) { changes.push({op: 'delete', attribute_id: id}); });
            return changes;
        }
        async function saveDraft() {
            var changes = operations();
            if (!changes.length) { state.dirty = false; status('没有需要保存的新修改。'); return; }
            if (!state.draft) {
                var body = state.scope === 'global' ? {scope: 'global'} : {scope: 'space', space_id: Number(state.scope.slice(6))};
                body.base_profile_version = state.profile.revision;
                state.draft = await request('/me/profile/drafts', {method: 'POST', json: body, headers: {'Idempotency-Key': uuid()}});
            }
            state.draft = await request(draftPath(), {method: 'PUT', json: {expected_version: state.draft.draft_version, fields: changes}});
            resetRecords(); render(); status('草稿已保存。请预览并勾选本次要确认的条目。');
        }
        async function confirmSelected() {
            if (state.dirty) { throw new Error('请先保存本页修改，再确认所选条目。'); }
            if (!state.draft || !state.selected.size) { throw new Error('请先勾选本次要确认的条目。'); }
            var result = await request(draftPath('/confirm'), {method: 'POST', json: {expected_version: state.draft.draft_version, base_revision: state.draft.base_revision, attribute_ids: Array.from(state.selected), confirmation_intent: 'confirm'}});
            await load(); status('已确认 ' + result.confirmed_attribute_ids.length + ' 条变更。' + (state.draft ? '其余内容继续保存在草稿中。' : '资料已保存。'));
        }
        async function uploadFile(path, file) {
            if (file.size < 1 || file.size > 5 * 1024 * 1024) { throw new Error('请选择不超过 5 MiB 的图片。'); }
            var form = new FormData(); form.append('file', file); return request(path, {method: 'POST', body: form, headers: {'Idempotency-Key': uuid()}});
        }
        function appendValue(parent, value) {
            if (value === undefined || value === null) { return; }
            if (Array.isArray(value)) { var list = node('ul'); value.forEach(function (item) { var entry = node('li'); appendValue(entry, item); list.append(entry); }); parent.append(list); return; }
            if (typeof value === 'object') {
                var list = node('dl'); Object.entries(value).forEach(function (entry) {
                    if (entry[0] === 'code' && value.label) { return; }
                    list.append(node('dt', {}, labels[entry[0]] || entry[0])); var content = node('dd');
                    if (entry[0] === 'file_ref') { content.append(node('img', {src: mediaUrl(entry[1]), alt: '微信二维码', class: 'matcher-qr-preview'})); }
                    else { appendValue(content, entry[1]); } list.append(content);
                }); parent.append(list); return;
            }
            var string = String(value);
            if (/^https?:\/\//i.test(string)) {
                try { var url = new URL(string); if (url.protocol === 'http:' || url.protocol === 'https:') { parent.append(node('a', {href: url.href, target: '_blank', rel: 'noopener noreferrer'}, string)); return; } } catch (_) {}
            }
            parent.append(node('span', {}, choices[string] || string));
        }
        async function preview() {
            if (!config.privacyEnabled) { throw new Error('预览需要启用资料隐私插件。'); }
            if (state.dirty) { throw new Error('请先保存草稿，以便服务器预览当前修改。'); }
            var params = {perspective: byId('matcher-preview-perspective').value}; if (state.draft) { params.draft_id = state.draft.id; }
            var result = await request('/me/profile/preview' + query(params)), holder = byId('matcher-preview-result'); holder.replaceChildren();
            function items(dto) { return Array.isArray(dto) ? dto : (dto && dto.attributes) || []; }
            var all = items(result.profile).concat(items(result.contacts));
            if (!all.length) { holder.append(node('p', {class: 'matcher-editor-empty'}, '这个视角下暂无可展示的已保存资料。')); }
            all.forEach(function (item) {
                var entry = node('article', {class: 'matcher-preview-item', 'data-preview-key': item.key}), field = definition(item.key);
                entry.append(node('h3', {}, field ? field.label : item.key)); appendValue(entry, item.value); holder.append(entry);
            });
            status('已按服务器规则生成' + (params.perspective === 'owner' ? '本人' : choices[params.perspective]) + '预览。');
        }
        config.spaces.forEach(function (space) { byId('matcher-profile-scope').append(node('option', {value: 'space:' + space.id}, 'Space · ' + space.name)); });
        byId('matcher-profile-scope').addEventListener('change', function (event) {
            var next = event.target.value, previous = state.scope, hadIdentityDirty = state.identityDirty;
            if ((state.dirty || state.identityDirty) && !window.confirm('本页有未保存修改或未确认身份。切换会丢弃这些本地修改，已保存草稿仍会保留。继续吗？')) { event.target.value = state.scope; return; }
            action(async function () { state.scope = next; state.identityDirty = false; try { await load(); } catch (error) { state.scope = previous; state.identityDirty = hadIdentityDirty; event.target.value = previous; throw error; } });
        });
        byId('matcher-editor-reload').addEventListener('click', function () {
            if ((state.dirty || state.identityDirty) && !window.confirm('重新读取会丢弃本页未保存修改和未确认身份。已保存草稿会恢复，是否继续？')) { return; }
            action(async function () { var hadIdentityDirty = state.identityDirty; state.identityDirty = false; try { await load(); } catch (error) { state.identityDirty = hadIdentityDirty; throw error; } });
        });
        byId('matcher-draft-save').addEventListener('click', function () { action(saveDraft); });
        byId('matcher-draft-confirm').addEventListener('click', function () { action(confirmSelected); });
        byId('matcher-draft-select-all').addEventListener('click', function () { (state.draft ? state.draft.fields : []).forEach(function (item) { state.selected.add(item.attribute_id); }); renderPending(); });
        byId('matcher-preview-refresh').addEventListener('click', function () { action(preview); });
        byId('matcher-avatar-file').addEventListener('change', function (event) {
            var file = event.target.files[0]; if (!file) { return; }
            action(async function () { var result = await uploadFile('/me/avatar', file); state.avatarPending = result.file_ref; state.identityDirty = true; byId('matcher-avatar-preview').src = result.thumbnail_url || mediaUrl(result.file_ref); byId('matcher-avatar-preview').hidden = false; status('头像候选已上传，请点击“确认昵称与头像”完成更换。'); });
        });
        byId('matcher-nickname').addEventListener('input', function () { state.identityDirty = true; });
        byId('matcher-avatar-remove').addEventListener('click', function () { state.avatarPending = null; state.identityDirty = true; byId('matcher-avatar-preview').hidden = true; status('已选择默认头像，请点击“确认昵称与头像”保存。'); });
        byId('matcher-identity-save').addEventListener('click', function () {
            action(async function () {
                var body = {expected_version: state.identity.identity_version}, nickname = byId('matcher-nickname').value.trim();
                if (nickname !== (state.identity.nickname || '')) { body.nickname = nickname; }
                if (Object.prototype.hasOwnProperty.call(state, 'avatarPending')) { body.avatar_ref = state.avatarPending; }
                if (Object.keys(body).length === 1) { state.identityDirty = false; status('昵称与头像没有变化。'); return; }
                state.identity = await request('/me', {method: 'PATCH', json: body}); state.identityDirty = false; renderIdentity(); status('昵称与头像已确认。普通资料草稿保持原样。');
            });
        });
        action(load);
    }
    window.MatcherProfileEditor = {boot: boot};
    window.addEventListener('beforeunload', function (event) {
        if (current && current.root.isConnected && (current.dirty || current.identityDirty)) { event.preventDefault(); event.returnValue = ''; }
    });
})();
