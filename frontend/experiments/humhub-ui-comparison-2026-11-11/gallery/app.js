const routes = [
  {id:'route1-native',number:'01',name:'原生视图升级',stack:'PHP / Yii · Bootstrap · jQuery',description:'保留原生技术与资源，转写组件的外观和交互。适合以原生生态为基础逐页换肤。',tag:'原生框架',reuse:'设计参考 → 原生转写'},
  {id:'route2-plugin',number:'02',name:'React 首页插件',stack:'HumHub 模块 · React / Vite',description:'通过真实模块路由承载独立 React 页面，直接使用两套组件。本次最值得继续验证的方向。',tag:'建议继续',reuse:'双库源码直接复用'},
  {id:'route3-standalone',number:'03',name:'独立前端重写',stack:'Next.js · React · Tailwind',description:'页面组合与布局自由，手机首屏最紧凑。接回 HumHub 业务和完整迁移仍需另做。',tag:'独立应用',reuse:'双库源码直接复用'}
];
let currentView='desktop';
function applyView(view){
  currentView=view;
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  document.querySelectorAll('.route-card').forEach(card=>{
    const src='assets/'+card.dataset.route+'-'+view+'.png';
    card.querySelector('img').src=src;
    card.querySelector('img').alt=card.querySelector('h3').textContent+' · '+({desktop:'桌面首屏',mobile:'手机首屏',detail:'详情弹窗'})[view];
    card.querySelector('.preview').classList.toggle('mobile',view==='mobile');
    card.querySelectorAll('.screenshot-link').forEach(link=>link.href=src);
  });
  document.querySelector('#view-note').textContent=view==='mobile'?'390 × 844 真实手机视口截图；页面可继续向下滚动。':'1440 × 1000 同尺寸真实浏览器截图；点击大图看清细节。';
}
async function init(){
  const response=await fetch('data.json');
  if(!response.ok)throw new Error('验证数据载入失败');
  const data=await response.json();
  document.querySelector('#total-checks').textContent=data.passed+' / '+data.total;
  const grid=document.querySelector('#route-grid');
  for(const route of routes){
    const result=data.routes.find(item=>item.id===route.id);
    const card=document.createElement('article');
    card.className='route-card'+(route.number==='02'?' recommended':'');
    card.dataset.route=route.id;
    card.innerHTML='<div class="card-heading"><div><span class="route-number">ROUTE '+route.number+'</span><h3>'+route.name+'</h3><p class="stack">'+route.stack+'</p></div><span class="tag">'+route.tag+'</span></div><div class="preview"><a class="screenshot-link" target="_blank" rel="noopener"><img width="1440" height="1000"></a></div><div class="card-body"><p class="card-description">'+route.description+'</p><div class="metrics"><span class="metric">✓ '+result.passed+'/'+result.total+' 统一检查</span><span class="metric">'+route.reuse+'</span></div><div class="card-actions"><a class="live-link" target="_blank" rel="noopener" href="'+result.url+'">打开可交互首页 <span>↗</span></a><a class="large-link screenshot-link" target="_blank" rel="noopener">查看大图 ↗</a></div></div>';
    grid.append(card);
  }
  applyView(currentView);
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>applyView(button.dataset.view)));
init().catch(error=>{document.querySelector('#route-grid').textContent=error.message;});
