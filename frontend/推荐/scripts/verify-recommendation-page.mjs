// Actual component, synthetic transport. No HumHub/DB/OAuth/model requests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const integration = resolve(project, '../integration');
const require = createRequire(join(integration, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = mkdtempSync(join(tmpdir(), 'matcher-recommendation-ui-'));
const artifacts = join(project, 'artifacts/recommendation-connected-2026-11-12'); mkdirSync(artifacts, { recursive: true });
const report = { mode: 'synthetic browser UI, not live authorization', realBackendRequests: 0, databaseConnections: 0, modelCalls: 0, checks: [], errors: [], layouts: [], fonts: {} };
let server; let browser;
const check = (name, passed, details) => { report.checks.push({ name, passed, ...(details === undefined ? {} : { details }) }); assert.ok(passed, name); };
try {
  writeFileSync(join(temp, 'index.html'), '<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>');
  writeFileSync(join(temp, 'entry.tsx'), 'import ' + JSON.stringify(join(project, 'scripts/recommendation-ui-fixture.tsx')) + ';\nimport "./styles.css";\n');
  writeFileSync(join(temp, 'styles.css'), '@import ' + JSON.stringify(join(project, 'app/globals.css')) + ';\n@import ' + JSON.stringify(join(project, 'integration/recommendation.css')) + ';\n@source ' + JSON.stringify(project) + ';\n@font-face { font-family: Inter; src: url(' + JSON.stringify(join(project, 'app/fonts/inter-latin.woff2')) + '); font-weight:400 700; }\n@font-face { font-family: Bricolage; src: url(' + JSON.stringify(join(project, 'app/fonts/bricolage-grotesque-latin.woff2')) + '); font-weight:500 700; }\n:root { --font-body: Inter; --font-display: Bricolage; }\n');
  const packages = ['react', 'react-dom', 'cn', 'class-variance-authority', 'radix-ui', 'motion', 'lucide-react'];
  await build({ root: temp, configFile: false, logLevel: 'error', plugins: [react(), tailwind()], resolve: { alias: [{ find: '@', replacement: project }, { find: 'tailwindcss', replacement: join(integration, 'node_modules/tailwindcss/index.css') }, { find: 'tw-animate-css', replacement: join(integration, 'node_modules/tw-animate-css/dist/tw-animate.css') }, { find: 'shadcn/tailwind.css', replacement: join(integration, 'node_modules/shadcn/dist/tailwind.css') }, ...packages.map(name => ({ find: name, replacement: join(integration, 'node_modules', name) }))], dedupe: ['react', 'react-dom'] }, build: { outDir: join(temp, 'dist'), emptyOutDir: true } });
  server = createServer((request, response) => { const url = new URL(request.url, 'http://localhost'); const file = resolve(temp, 'dist', '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname))); if (!file.startsWith(join(temp, 'dist') + '/')) { response.writeHead(403).end(); return; } try { response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[extname(file)] || 'application/octet-stream'); response.end(readFileSync(file)); } catch { response.writeHead(404).end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000); page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { report.errors.push('Unexpected external request'); return route.abort(); } if (route.request().url().includes('/api/')) { report.realBackendRequests++; return route.abort(); } return route.continue(); });
  const reload = async () => { await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: '虚构伙伴 11', exact: true }).waitFor(); };
  const mode = async name => page.evaluate(value => window.recommendationTest.setMode(value), name);
  const refresh = async () => { await page.evaluate(() => window.recommendationTest.refresh()); };
  await reload();
  check('Explicit synthetic label', await page.getByText('合成 UI 测试 · 非真实服务', { exact: true }).isVisible());
  check('Ordinary discovery performs no writes', await page.evaluate(() => window.recommendationTest.calls.every(call => call.method === 'GET')));
  check('Two people remain two', await page.locator('.people-selector button').count() === 2);
  check('Five actual attributes stay five', await page.locator('.profile-list-row').count() === 5);
  check('No avatars fetched for opaque/null references', await page.locator('.person-avatar img').count() === 0);
  check('No synthetic demo name or score', !/林小满|许知夏|唐可|匹配度|\d+\s*%/.test(await page.locator('.person-card').innerText()));
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  for (const [name, selector] of [['display', '.brand-link .font-heading'], ['body', '.person-tags [data-slot=badge]'], ['chinese', '.page-heading h1']]) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector }); report.fonts[name] = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
  }
  check('Actual English display font loads', report.fonts.display.some(font => /Bricolage/.test(font.familyName) && font.glyphCount > 0));
  check('Actual English body font loads', report.fonts.body.some(font => /Inter/.test(font.familyName) && font.glyphCount > 0));
  check('Actual Chinese glyph font recorded', report.fonts.chinese.some(font => /PingFang|YaHei|Noto Sans CJK/.test(font.familyName) && font.glyphCount > 0));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 }); await page.evaluate(() => scrollTo(0, 0));
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, stage: document.querySelector('.showcase-content').getBoundingClientRect().toJSON(), person: document.querySelector('.person-card').getBoundingClientRect().toJSON(), board: document.querySelector('.runtime-facts-board').getBoundingClientRect().toJSON(), bodyFont: getComputedStyle(document.querySelector('.person-intro')).fontSize }));
    report.layouts.push(geometry); check('No horizontal overflow ' + width, geometry.scrollWidth === width, geometry); check('Readable body ' + width, Number.parseFloat(geometry.bodyFont) >= 14);
    if (width < 500) check('Mobile person selector has its own row ' + width, await page.evaluate(() => { const people = document.querySelector('.people-selector').getBoundingClientRect(); const arrows = document.querySelector('.playback-controls').getBoundingClientRect(); return arrows.top >= people.bottom; }));
    await page.screenshot({ path: join(artifacts, 'discovery-' + width + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.runtime-fact-tab').nth(2).click();
  const detailButton = page.getByRole('button', { name: '展开资料：虚构活动协作原型', exact: true }); await detailButton.click();
  check('Project detail contains full facts', await page.getByRole('dialog').getByText('设计服务接口并与同伴验证流程', { exact: true }).isVisible());
  check('Project URL remains inert text', await page.getByRole('dialog').locator('a').count() === 0);
  await page.keyboard.press('Escape'); check('Detail returns keyboard focus', await detailButton.evaluate(el => el === document.activeElement));
  await page.getByRole('button', { name: '下一位', exact: true }).click(); await page.getByRole('heading', { name: '虚构伙伴 12', exact: true }).waitFor();
  check('Last person does not wrap', await page.getByRole('button', { name: '下一位', exact: true }).isDisabled());
  await page.getByRole('button', { name: '上一位', exact: true }).click(); await page.getByRole('heading', { name: '虚构伙伴 11', exact: true }).waitFor();
  await mode('one'); await refresh(); check('One person disables both arrows', await page.getByRole('button', { name: '上一位', exact: true }).isDisabled() && await page.getByRole('button', { name: '下一位', exact: true }).isDisabled());
  await mode('empty'); await refresh(); check('Zero people show empty state', await page.locator('[data-state=empty]').isVisible() && await page.locator('.person-card').count() === 0); check('Connected rules with no candidate asks for a person, not API setup', await page.getByText('先选择一位可见伙伴，再查看合作依据。', { exact: true }).isVisible() && await page.getByRole('button', { name: '先选择伙伴', exact: true }).isDisabled() && await page.getByText('合作分析暂未接入', { exact: true }).count() === 0 && await page.getByText('AI 多轮对话尚未接入此页面。', { exact: true }).isVisible()); await page.screenshot({ path: join(artifacts, 'empty.png') });
  await mode('network'); await refresh(); check('Network is not no-candidates', await page.getByText('连接中断，暂时无法读取人选。这不代表没有合适的人。', { exact: true }).isVisible() && await page.locator('[data-state=empty]').count() === 0); await page.screenshot({ path: join(artifacts, 'network-error.png') });
  await mode('pagination'); await refresh(); check('First page has 24 people', await page.locator('.people-selector button').count() === 24); await page.getByRole('button', { name: '加载更多伙伴', exact: true }).click(); await page.getByText('已浏览当前条件下全部可见人选 · 已加载 25 人', { exact: true }).waitFor(); check('Cursor appends final person', await page.locator('.people-selector button').count() === 25);
  await page.getByLabel('技能代码', { exact: true }).fill('none'); await page.getByRole('button', { name: '应用筛选', exact: true }).click(); await page.locator('[data-state=empty]').waitFor(); check('Filter clears cursor', await page.evaluate(() => { const list = window.recommendationTest.calls.filter(call => new URL(call.path, location.origin).pathname.endsWith('/discovery')); return !new URL(list.at(-1).path, location.origin).searchParams.has('cursor'); }));
  await reload(); await page.getByRole('button', { name: '读取我的可选资料', exact: true }).click(); await page.getByRole('button', { name: '保存：不使用本人资料', exact: true }).waitFor();
  check('GET options never imply consent', await page.evaluate(() => window.recommendationTest.calls.every(call => call.method === 'GET')));
  check('Analysis disabled before save', await page.getByRole('button', { name: '分析我与 虚构伙伴 11', exact: true }).isDisabled());
  await page.getByRole('button', { name: '保存：不使用本人资料', exact: true }).click(); await page.getByText('已按服务端回执保存本次选择。', { exact: true }).waitFor();
  check('Empty save sends exact contract with event precondition', await page.evaluate(() => { const call = window.recommendationTest.calls.find(item => item.method === 'PUT'); return Object.keys(call.body).sort().join(',') === 'attribute_ids,expected_current_event,expected_selection_version' && call.body.attribute_ids.length === 0 && call.body.expected_current_event.selection_revision === 'selection-' + 'a'.repeat(32); }));
  await page.getByRole('button', { name: '分析我与 虚构伙伴 11', exact: true }).click(); await page.locator('.runtime-analysis-row').first().waitFor();
  check('Rules show five unknown dimensions', await page.locator('.runtime-analysis-row[data-status=unknown]').count() === 5);
  check('POST carries only optimistic versions', await page.evaluate(() => { const call = window.recommendationTest.calls.find(item => item.method === 'POST'); return Object.keys(call.body).sort().join(',') === 'expected_candidate,expected_current_event,expected_selection_version'; }));
  await page.locator('.runtime-analysis-results').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(artifacts, 'rules-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 }); await page.screenshot({ path: join(artifacts, 'rules-mobile.png'), fullPage: true }); check('Rules fit small mobile', await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
  await page.locator('.runtime-selection-option input').first().check(); check('Changing selection clears analysis', await page.locator('.runtime-analysis-row').count() === 0 && await page.getByRole('button', { name: '分析我与 虚构伙伴 11', exact: true }).isDisabled());
  await page.getByRole('button', { name: '保存选中的 1 条资料', exact: true }).click(); await page.getByText('已按服务端回执保存本次选择。', { exact: true }).waitFor();
  await mode('analysis-unavailable'); await page.getByRole('button', { name: '分析我与 虚构伙伴 11', exact: true }).click(); await page.getByText('合作分析服务暂时不可用。你仍可以继续普通发现。', { exact: true }).waitFor(); check('503 is unavailable', await page.locator('.runtime-analysis-row').count() === 0);
  await mode('unknown-code'); await page.getByRole('button', { name: '分析我与 虚构伙伴 11', exact: true }).click(); await page.getByText('这次分析未能完成，或服务返回了尚不支持的内容。请重新读取后再试。', { exact: true }).waitFor(); check('Unknown conclusion not guessed', await page.locator('.runtime-analysis-row').count() === 0);
  await mode('analysis-held-denial'); await page.getByRole('button', { name: '分析我与 虚构伙伴 11', exact: true }).click(); await page.getByRole('button', { name: '正在生成规则分析', exact: true }).waitFor();
  await page.getByRole('button', { name: '查看虚构伙伴 12', exact: true }).click(); await page.getByRole('heading', { name: '虚构伙伴 12', exact: true }).waitFor(); await page.evaluate(() => window.recommendationTest.release());
  await page.waitForFunction(() => !document.querySelector('.person-card')); check('Late analysis 404 clears same-context projections', await page.locator('.person-card').count() === 0);
  for (const status of [401, 403]) {
    await reload(); await page.getByRole('button', { name: '读取我的可选资料', exact: true }).click(); await page.getByRole('button', { name: '保存：不使用本人资料', exact: true }).click(); await page.getByText('已按服务端回执保存本次选择。', { exact: true }).waitFor();
    await mode('analysis-held-' + status); await page.getByRole('button', { name: '分析我与 虚构伙伴 11', exact: true }).click(); await page.getByRole('button', { name: '正在生成规则分析', exact: true }).waitFor();
    await refresh(); await page.getByRole('heading', { name: '虚构伙伴 11', exact: true }).waitFor(); await page.evaluate(() => window.recommendationTest.release());
    await page.waitForFunction(() => !document.querySelector('.person-card')); check('Old analysis ' + status + ' invalidates after newer list refresh', await page.locator('.person-card').count() === 0 && await page.locator('.people-selector button').count() === 0);
  }
  await reload(); await page.evaluate(() => window.recommendationTest.changeContext()); await page.getByRole('button', { name: '查看虚构伙伴 12', exact: true }).click(); await page.getByText('当前活动或访问资格已变化，请重新确认活动。', { exact: true }).waitFor(); check('Changed activity clears people', await page.locator('.person-card').count() === 0 && await page.locator('.people-selector button').count() === 0);
  check('No real API requests', report.realBackendRequests === 0); check('No execution errors', report.errors.length === 0, report.errors);
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks.length, passed: report.checks.filter(item => item.passed).length, artifacts, realBackendRequests: report.realBackendRequests, modelCalls: 0, databaseConnections: 0 }));
} catch (error) { report.errors.push(String(error)); writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n'); throw error; }
finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); rmSync(temp, { recursive: true, force: true }); }
