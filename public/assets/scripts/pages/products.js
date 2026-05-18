// 历史兼容模块：课程产品不再作为新增教学售卖功能默认入口。
function syncProductFilterOptions(){
  const typeValue=document.getElementById('prodTypeFilter')?.value||'';
  const typeOptions=[{value:'',label:'全部类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  const host=document.getElementById('prodTypeFilterHost');
  if(host)host.innerHTML=renderCourtDropdownHtml('prodTypeFilter','全部类型',typeOptions,typeValue,false,'renderProducts');
}
function renderProducts(){
  syncProductFilterOptions();
  const q=(document.getElementById('prodSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('prodTypeFilter')?.value||'';
  const list=products.filter(p=>{if(!searchHit(q,p.name,p.type,p.price,p.lessons,p.maxStudents,p.notes))return false;if(tf&&p.type!==tf)return false;return true;});
  document.getElementById('productGrid').innerHTML=list.length?list.map(p=>{
    const linkedClasses=classes.filter(c=>c.productId===p.id).length;
    const linkedPackages=packages.filter(pkg=>pkg.productId===p.id).length;
    const locked=productHasReferences(p.id);
    return `<div class="product-card-shell"><div class="showcase-card-body"><div class="showcase-card-header"><div class="showcase-card-title-group"><div class="showcase-card-title">${esc(p.name)}<span class="tms-tag ${productTypeTagClass(p.type)}">${esc(p.type||'—')}</span></div><div class="showcase-card-subtitle">历史课程模板查看</div></div>${locked?'<span class="showcase-status-tag is-linked">已被引用</span>':''}</div><div class="showcase-highlight"><span class="showcase-highlight-value">${p.maxStudents||1}<span class="showcase-highlight-unit">人</span></span><span class="showcase-highlight-divider">/</span><span class="showcase-highlight-value">¥${fmt(p.price)}</span><span class="showcase-highlight-divider">/</span><span class="showcase-highlight-value">${p.lessons||0}<span class="showcase-highlight-unit">节</span></span></div><div class="showcase-kv-list"><div class="showcase-kv-row"><div class="showcase-kv-label">历史班次</div><div class="showcase-kv-value">${linkedClasses} 个</div></div><div class="showcase-kv-row"><div class="showcase-kv-label">历史课包</div><div class="showcase-kv-value">${linkedPackages} 个</div></div></div></div><div class="showcase-card-footer"><div class="showcase-card-actions"><button class="showcase-action-btn is-primary" onclick="goPage('packages')">看售卖课包</button></div><div class="showcase-card-actions"><button class="showcase-action-btn" onclick="openProductModal('${p.id}')">查看</button></div></div></div>`;
  }).join(''):'<div class="course-showcase-empty"><div class="empty"><p>暂无课程产品</p></div></div>';
}

function openProductModal(id){
  editId=id;const p=id?products.find(x=>x.id===id):null;
  const body=`<div class="tms-audit-note" style="margin-bottom:18px">历史兼容资料查看：本页不再提供新增、编辑、删除入口；新业务请在「售卖课包」「购买记录」「排课表」处理。</div><div class="tms-section-header" style="margin-top:0;">基本信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">课程名称</label><input class="finput tms-form-control" value="${rv(p,'name')}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">类型</label><input class="finput tms-form-control" value="${rv(p,'type')}" readonly></div><div class="tms-form-item"><label class="tms-form-label">人数</label><input class="finput tms-form-control" value="${rv(p,'maxStudents',1)}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">定价</label><input class="finput tms-form-control" value="${rv(p,'price',0)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">课时</label><input class="finput tms-form-control" value="${rv(p,'lessons',0)}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">历史班次</label><input class="finput tms-form-control" value="${classes.filter(c=>c.productId===p?.id).length} 个" readonly></div><div class="tms-form-item"><label class="tms-form-label">历史课包</label><input class="finput tms-form-control" value="${packages.filter(pkg=>pkg.productId===p?.id).length} 个" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" readonly>${esc(rv(p,'notes'))}</textarea></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button>`;
  setCourtModalFrame('查看历史课程产品',body,footer,'modal-tight');
}
async function saveProduct(){
  toast('课程产品页已收为历史只读壳，请改到售卖课包或购买记录处理。','warn');
}
