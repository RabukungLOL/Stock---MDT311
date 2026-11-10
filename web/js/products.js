// หน้ารายการสินค้า
//   Read   : แสดง ค้นหา และกรองสินค้า
//   Delete : ลบสินค้า (ฐานข้อมูลจะไม่ยอมให้ลบสินค้าที่มีประวัติรับเข้า/เบิกออก)

const productAlert = document.getElementById('alert-box');
const rowsEl = document.getElementById('product-rows');
const searchEl = document.getElementById('search');
const categoryEl = document.getElementById('category-filter');
const lowOnlyEl = document.getElementById('low-only');

async function loadCategories() {
  const { data, error } = await db.from('categories').select('id, name').order('name');
  if (error) return showAlert(productAlert, 'danger', friendlyError(error));
  categoryEl.insertAdjacentHTML(
    'beforeend',
    data.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  );
}

// ตัวเลขสรุปด้านบน คิดจากสินค้าทั้งหมด (ไม่ขึ้นกับตัวกรอง)
async function loadStats() {
  const { data, error } = await db.from('products').select('price, stock_quantity, is_low_stock');
  if (error) return;
  const low = data.filter((p) => p.is_low_stock).length;
  const value = data.reduce((sum, p) => sum + Number(p.price) * p.stock_quantity, 0);
  document.getElementById('stat-total').textContent = fmtNumber(data.length);
  document.getElementById('stat-low').textContent = fmtNumber(low);
  document.getElementById('stat-value').textContent = fmtMoney(value);
}

// READ: ดึงสินค้าพร้อมชื่อหมวดหมู่ แล้วกรองตามที่ผู้ใช้เลือก
async function loadProducts() {
  let query = db
    .from('products')
    .select('id, sku, name, unit, price, stock_quantity, reorder_level, is_low_stock, categories(name)')
    .order('sku');

  const keyword = cleanSearch(searchEl.value);
  if (keyword) query = query.or(`name.ilike.%${keyword}%,sku.ilike.%${keyword}%`);
  if (categoryEl.value) query = query.eq('category_id', categoryEl.value);
  if (lowOnlyEl.checked) query = query.eq('is_low_stock', true);

  const { data, error } = await query;
  if (error) {
    rowsEl.innerHTML = '<tr><td colspan="8" class="empty">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    return showAlert(productAlert, 'danger', friendlyError(error));
  }
  if (data.length === 0) {
    rowsEl.innerHTML = '<tr><td colspan="8" class="empty">ไม่พบสินค้าที่ตรงกับเงื่อนไข</td></tr>';
    return;
  }

  rowsEl.innerHTML = data
    .map(
      (p) => `
      <tr>
        <td class="sku">${escapeHtml(p.sku)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.categories?.name ?? '-')}</td>
        <td class="num">${fmtMoney(p.price)}</td>
        <td class="num">${fmtNumber(p.stock_quantity)} ${escapeHtml(p.unit)}</td>
        <td class="num">${fmtNumber(p.reorder_level)}</td>
        <td>${stockBadge(p)}</td>
        <td class="actions">
          <a class="btn btn-sm" href="stock.html?product_id=${p.id}">รับ/เบิก</a>
          <a class="btn btn-sm" href="product-form.html?id=${p.id}">แก้ไข</a>
          <button type="button" class="btn btn-sm btn-danger" data-delete="${p.id}"
            data-label="${escapeHtml(p.sku + ' ' + p.name)}">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

// DELETE: ลบสินค้า
async function deleteProduct(id, label) {
  if (!confirm(`ต้องการลบสินค้า "${label}" ใช่ไหม?\nลบแล้วกู้คืนไม่ได้`)) return;

  const { data, error } = await db.from('products').delete().eq('id', id).select('id');

  if (error) {
    const message =
      error.code === '23503'
        ? `ลบ "${label}" ไม่ได้ เพราะสินค้านี้มีประวัติรับเข้า/เบิกออกอยู่ ระบบต้องเก็บประวัติไว้ตรวจสอบย้อนหลัง`
        : friendlyError(error);
    return showAlert(productAlert, 'danger', message);
  }
  if (data.length === 0) {
    return showAlert(productAlert, 'warning', 'ไม่พบสินค้านี้ หรือไม่มีสิทธิ์ลบ');
  }
  showAlert(productAlert, 'success', `ลบสินค้า "${label}" แล้ว`);
  loadProducts();
  loadStats();
}

rowsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete]');
  if (btn) deleteProduct(btn.dataset.delete, btn.dataset.label);
});

let searchTimer;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadProducts, 300);
});
categoryEl.addEventListener('change', loadProducts);
lowOnlyEl.addEventListener('change', loadProducts);

(async function init() {
  const session = await requireLogin();
  renderHeader('products', session.user.email);
  showFlash(productAlert);
  await loadCategories();
  loadProducts();
  loadStats();
})();
