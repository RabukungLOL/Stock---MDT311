// หน้าประวัติ (Read): ดึง stock_transactions พร้อมข้อมูลสินค้าที่เชื่อมด้วย Foreign Key

const historyAlert = document.getElementById('alert-box');
const historyRows = document.getElementById('history-rows');
const productFilter = document.getElementById('product-filter');
const typeFilter = document.getElementById('type-filter');
const rowCount = document.getElementById('row-count');

async function loadProductOptions() {
  const { data, error } = await db.from('products').select('id, sku, name').order('sku');
  if (error) return showAlert(historyAlert, 'danger', friendlyError(error));
  productFilter.insertAdjacentHTML(
    'beforeend',
    data.map((p) => `<option value="${p.id}">${escapeHtml(p.sku)} · ${escapeHtml(p.name)}</option>`).join('')
  );
}

async function loadHistory() {
  let query = db
    .from('stock_transactions')
    .select('id, type, quantity, note, created_by_email, created_at, products(sku, name, unit)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(200);

  if (productFilter.value) query = query.eq('product_id', productFilter.value);
  if (typeFilter.value) query = query.eq('type', typeFilter.value);

  const { data, error } = await query;
  if (error) {
    historyRows.innerHTML = '<tr><td colspan="7" class="empty">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    return showAlert(historyAlert, 'danger', friendlyError(error));
  }

  rowCount.textContent = `${fmtNumber(data.length)} รายการ`;
  if (data.length === 0) {
    historyRows.innerHTML = '<tr><td colspan="7" class="empty">ยังไม่มีรายการ</td></tr>';
    return;
  }

  historyRows.innerHTML = data
    .map(
      (t) => `
      <tr>
        <td>${fmtDateTime(t.created_at)}</td>
        <td class="sku">${escapeHtml(t.products?.sku ?? '-')}</td>
        <td>${escapeHtml(t.products?.name ?? '-')}</td>
        <td>${typeBadge(t.type)}</td>
        <td class="num">${t.type === 'IN' ? '+' : '−'}${fmtNumber(t.quantity)} ${escapeHtml(t.products?.unit ?? '')}</td>
        <td>${escapeHtml(t.note ?? '')}</td>
        <td class="muted">${escapeHtml(t.created_by_email ?? 'ระบบ')}</td>
      </tr>`
    )
    .join('');
}

productFilter.addEventListener('change', loadHistory);
typeFilter.addEventListener('change', loadHistory);

(async function init() {
  const session = await requireLogin();
  renderHeader('history', session.user.email);
  await loadProductOptions();
  loadHistory();
})();
