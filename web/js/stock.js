// หน้ารับเข้า / เบิกออก
// เว็บเพิ่มแถวใน stock_transactions อย่างเดียว ส่วนการปรับยอดใน products
// และการกันเบิกเกินยอด ทำโดย Trigger ในฐานข้อมูล (apply_stock_transaction)

const stockAlert = document.getElementById('alert-box');
const stockForm = document.getElementById('stock-form');
const productSelect = document.getElementById('product_id');
const qtyInput = document.getElementById('quantity');
const noteInput = document.getElementById('note');
const submitBtn = document.getElementById('submit-btn');
const stockPanel = document.getElementById('stock-panel');
const recentList = document.getElementById('recent-list');

let products = []; // เก็บสินค้าทั้งหมดไว้แสดงยอดคงเหลือ

const selectedType = () => document.querySelector('input[name="type"]:checked').value;
const selectedProduct = () => products.find((p) => String(p.id) === productSelect.value);

function setFieldError(id, message) {
  const box = document.querySelector(`[data-error-for="${id}"]`);
  box.textContent = message;
  box.closest('.field').classList.toggle('has-error', Boolean(message));
}

async function loadProducts(keepSelection) {
  const previous = keepSelection ? productSelect.value : null;
  const { data, error } = await db
    .from('products')
    .select('id, sku, name, unit, stock_quantity, reorder_level, is_low_stock')
    .order('sku');
  if (error) return showAlert(stockAlert, 'danger', friendlyError(error));

  products = data;
  productSelect.innerHTML =
    '<option value="">เลือกสินค้า</option>' +
    data
      .map((p) => `<option value="${p.id}">${escapeHtml(p.sku)} · ${escapeHtml(p.name)} (คงเหลือ ${fmtNumber(p.stock_quantity)})</option>`)
      .join('');
  if (previous) productSelect.value = previous;
}

// แสดงยอดคงเหลือ และคำนวณว่าหลังบันทึกจะเหลือเท่าไร
function renderPanel() {
  const p = selectedProduct();
  if (!p) {
    stockPanel.innerHTML = 'เลือกสินค้าเพื่อดูยอดคงเหลือ';
    stockPanel.className = 'muted';
    return;
  }
  stockPanel.className = '';
  const qty = Number(qtyInput.value);
  let preview = '';
  if (Number.isInteger(qty) && qty > 0) {
    const after = selectedType() === 'IN' ? p.stock_quantity + qty : p.stock_quantity - qty;
    preview =
      after < 0
        ? `<div class="preview bad">เบิกเกินยอดคงเหลือ ${fmtNumber(-after)} ${escapeHtml(p.unit)} ระบบจะไม่ยอมบันทึก</div>`
        : `<div class="preview">หลังบันทึกจะเหลือ <strong>${fmtNumber(after)}</strong> ${escapeHtml(p.unit)}</div>`;
  }
  stockPanel.innerHTML = `
    <div class="current-stock">${fmtNumber(p.stock_quantity)} <span class="muted" style="font-size:16px">${escapeHtml(p.unit)}</span></div>
    <div>${stockBadge(p)} <span class="muted">จุดสั่งซื้อ ${fmtNumber(p.reorder_level)}</span></div>
    ${preview}`;
}

async function loadRecent() {
  const p = selectedProduct();
  if (!p) {
    recentList.innerHTML = '<li class="muted">–</li>';
    return;
  }
  const { data, error } = await db
    .from('stock_transactions')
    .select('type, quantity, note, created_at')
    .eq('product_id', p.id)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return;
  recentList.innerHTML = data.length
    ? data
        .map(
          (t) => `<li><span>${typeBadge(t.type)} ${fmtNumber(t.quantity)} ${escapeHtml(t.note ?? '')}</span>
                  <span class="muted">${fmtDateTime(t.created_at)}</span></li>`
        )
        .join('')
    : '<li class="muted">ยังไม่มีรายการ</li>';
}

productSelect.addEventListener('change', () => {
  setFieldError('product_id', '');
  renderPanel();
  loadRecent();
});
qtyInput.addEventListener('input', () => {
  setFieldError('quantity', '');
  renderPanel();
});
document.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener('change', renderPanel));

// CREATE (stock_transactions) → Trigger UPDATE (products.stock_quantity)
stockForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert(stockAlert);

  const p = selectedProduct();
  const qtyRaw = qtyInput.value.trim();
  let ok = true;
  if (!p) { setFieldError('product_id', 'เลือกสินค้า'); ok = false; }
  if (!/^\d+$/.test(qtyRaw) || Number(qtyRaw) <= 0) {
    setFieldError('quantity', 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0');
    ok = false;
  }
  if (!ok) return;

  // หมายเหตุ: ไม่ได้กันเบิกเกินยอดที่หน้าเว็บ ให้ฐานข้อมูลเป็นคนปฏิเสธ
  // เพื่อให้กฎนี้ใช้ได้กับทุกช่องทาง (เว็บ, API, SQL) และกันกรณีสองคนเบิกพร้อมกัน
  const type = selectedType();
  const quantity = Number(qtyRaw);
  submitBtn.disabled = true;

  const { error } = await db.from('stock_transactions').insert({
    product_id: p.id,
    type,
    quantity,
    note: noteInput.value.trim() || null,
  });

  submitBtn.disabled = false;

  if (error) {
    await loadProducts(true);
    renderPanel();
    return showAlert(stockAlert, 'danger', friendlyError(error));
  }

  await loadProducts(true);
  const updated = selectedProduct();
  showAlert(
    stockAlert,
    'success',
    `บันทึก${type === 'IN' ? 'รับเข้า' : 'เบิกออก'} ${updated.sku} จำนวน ${fmtNumber(quantity)} ${updated.unit} แล้ว คงเหลือ ${fmtNumber(updated.stock_quantity)} ${updated.unit}`
  );
  qtyInput.value = '';
  noteInput.value = '';
  renderPanel();
  loadRecent();
});

(async function init() {
  const session = await requireLogin();
  renderHeader('stock', session.user.email);
  await loadProducts(false);

  // มาจากปุ่ม "รับ/เบิก" ในหน้ารายการสินค้า
  const preset = new URLSearchParams(window.location.search).get('product_id');
  if (preset) {
    productSelect.value = preset;
    renderPanel();
    loadRecent();
  }
})();
