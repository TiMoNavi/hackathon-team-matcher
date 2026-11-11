(function () {
  'use strict';
  var bound = window.__comparisonNativeBoundRoots || new WeakSet();
  window.__comparisonNativeBoundRoots = bound;
  function boot() {
    var root = document.getElementById('native-comparison');
    if (!root || bound.has(root)) return;
    bound.add(root);
    var data = JSON.parse(root.querySelector('[data-demo-json]').textContent);
    var search = root.querySelector('[data-search]');
    var cells = Array.from(root.querySelectorAll('[data-member]'));
    var dialog = root.querySelector('[data-dialog]');
    var activeRole = '全部';
    var followed = new Set();
    var currentMember = null;
    var toastTimer;
    var previousFocus;
    function notify(message) {
      var toast = root.querySelector('[data-toast]');
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.hidden = true; }, 2800);
    }
    function filter() {
      var query = search.value.trim().toLocaleLowerCase();
      var count = 0;
      cells.forEach(function (cell) {
        var matches = (activeRole === '全部' || cell.dataset.memberRole === activeRole) && (!query || cell.dataset.searchable.includes(query));
        cell.hidden = !matches;
        if (matches) count += 1;
      });
      root.querySelector('[data-count]').textContent = count + ' 位伙伴';
      root.querySelector('[data-empty]').hidden = count !== 0;
      root.querySelectorAll('[data-role]').forEach(function (button) {
        var active = button.dataset.role === activeRole;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    function toggleFollow(id) {
      var member = data.members.find(function (m) { return m.id === id; });
      if (!member) return;
      if (followed.has(id)) followed.delete(id); else followed.add(id);
      root.querySelectorAll('[data-follow="' + id + '"]').forEach(function (button) {
        var active = followed.has(id);
        button.setAttribute('aria-pressed', String(active));
        button.setAttribute('aria-label', (active ? '取消关注' : '关注') + member.name);
        button.innerHTML = '<i class="fa ' + (active ? 'fa-check' : 'fa-plus') + '" aria-hidden="true"></i>';
      });
      if (currentMember && currentMember.id === id) {
        root.querySelector('[data-dialog-follow]').textContent = followed.has(id) ? '已关注 · 点击取消' : '关注这位伙伴';
      }
      notify((followed.has(id) ? '已关注 ' : '已取消关注 ') + member.name + '（仅本地演示）');
    }
    function openDetails(id, trigger) {
      var member = data.members.find(function (m) { return m.id === id; });
      if (!member) return;
      currentMember = member;
      previousFocus = trigger;
      var avatar = root.querySelector('[data-detail-avatar]');
      avatar.textContent = member.initial;
      avatar.className = 'cn-avatar cn-avatar-' + member.color;
      root.querySelector('[data-detail-name]').textContent = member.name;
      root.querySelector('[data-detail-role]').textContent = member.role;
      root.querySelector('[data-detail-headline]').textContent = member.headline;
      root.querySelector('[data-detail-availability]').textContent = member.availability;
      var skills = root.querySelector('[data-detail-skills]');
      skills.replaceChildren();
      member.skills.forEach(function (skill) { var span = document.createElement('span'); span.textContent = skill; skills.append(span); });
      root.querySelector('[data-dialog-follow]').textContent = followed.has(id) ? '已关注 · 点击取消' : '关注这位伙伴';
      dialog.showModal();
    }
    root.addEventListener('click', function (event) {
      var target = event.target.closest('button,a');
      if (!target || !root.contains(target)) return;
      if (target.hasAttribute('data-role')) { activeRole = target.dataset.role; filter(); }
      else if (target.hasAttribute('data-follow')) toggleFollow(target.dataset.follow);
      else if (target.hasAttribute('data-detail')) openDetails(target.dataset.detail, target);
      else if (target.hasAttribute('data-close-dialog')) dialog.close();
      else if (target.hasAttribute('data-dialog-follow') && currentMember) toggleFollow(currentMember.id);
      else if (target.hasAttribute('data-reset')) { activeRole = '全部'; search.value = ''; filter(); search.focus(); }
      else if (target.hasAttribute('data-explore')) { root.querySelector('.cn-members').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'}); search.focus({preventScroll:true}); }
      else if (target.hasAttribute('data-home')) { event.preventDefault(); window.scrollTo({top:0,behavior:'smooth'}); }
      else if (target.hasAttribute('data-nav')) { notify(target.dataset.nav === '发现' ? '你正在浏览当前活动的演示伙伴' : target.dataset.nav + '入口是本次首页结构演示，未接业务功能'); }
      else if (target.hasAttribute('data-event')) notify('AI 创造者周末 · 32 位参与者 · 上海与线上同步（演示）');
      else if (target.hasAttribute('data-notifications')) notify('这里会显示活动动态与协作通知（演示）');
      else if (target.hasAttribute('data-filter-help')) notify('可以按角色筛选，或搜索伙伴的姓名与技能');
      else if (target.hasAttribute('data-open-preferences')) notify('协作偏好入口为演示，本次不写入真实画像');
      else if (target.hasAttribute('data-account')) notify('账户菜单为本地演示，使用的是合成成员资料');
      else if (target.hasAttribute('data-more-ideas')) notify('已展示两个演示想法，广场业务尚未接入');
    });
    search.addEventListener('input', filter);
    dialog.addEventListener('click', function (event) { if (event.target === dialog) { var r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
    dialog.addEventListener('close', function () { if (previousFocus && previousFocus.isConnected) previousFocus.focus(); });
    root.querySelectorAll('[data-step]').forEach(function (checkbox) { checkbox.addEventListener('change', function () { var steps = Array.from(root.querySelectorAll('[data-step]')); var count = steps.filter(function (c) { return c.checked; }).length; var percent = Math.round(count / steps.length * 100); root.querySelector('[data-progress-count]').textContent = count + '/' + steps.length; var bar = root.querySelector('[data-progress-bar]'); bar.style.width = percent + '%'; bar.setAttribute('aria-valuenow', String(percent)); }); });
    filter();
    root.dataset.ready = 'true';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (window.jQuery) window.jQuery(document).off('pjax:end.comparisonNative').on('pjax:end.comparisonNative', boot);
}());
