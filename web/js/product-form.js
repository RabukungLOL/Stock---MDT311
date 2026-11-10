// ฟอร์มสินค้า ใช้ทั้ง 2 กรณี
//   Create : product-form.html          (เพิ่มสินค้าใหม่)
//   Update : product-form.html?id=5     (แก้ไขสินค้า id 5)

const formAlert = document.getElementById('alert-box');
const productForm = document.getElementById('product-form');
const saveBtn = document.getElementById('save-btn');
const editId = new URLSearchParams(window.location.search).get('id');
const isEdit = Boolean(editId);

const fields = ['sku', 'name', 'category_id', 'unit', 'price', 'reorder_level', 'initial_stock'];
const $field = (id) => document.getElementById(id);

function setFieldError(id, message) {
  const box = document.querySelector(`[data-error-for="${id}"]`);
  if (!box) return;
  box.textContent = message;
  box.closest('.field').classList.toggle('has-error', Boolean(message));
}

function clearFieldErrors() {
  fields.forEach((f) => setFieldError(f, ''));
}

fields.forEach((f) => {
  const el = $field(f);
  if (el) el.addEventListener('input', () => setFieldError(f, ''));
});

// ตรวจข้อมูลก่อนส่ง (ฐานข้อมูลตรวจซ้ำอีกชั้นด้วย constraint)
function validate(values) {
  let ok = true;
  const fail = (id, msg) => { setFieldError(id, msg); ok = false; };

  if (!values.sku) fail('sku', 'กรอกรหัสสินค้า');
  if (!values.name) fail('name', 'กรอกชื่อสินค้า');
  if (!values.category_id) fail('category_id', 'เลือกหมวดหมู่');
  if (!values.unit) fail('unit', 'กรอกหน่วยนับ');
  if (values.priceRaw === '' || isNaN(values.price) || values.price < 0) fail('price', 'ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  if (!isNonNegativeInt(values.reorderRaw)) fail('reorder_level', 'จุดสั่งซื้อต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
  if (!isEdit && !isNonNegativeInt(values.initialRaw)) fail('initial_stock', 'จำนวนเริ่มต้นต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
  return ok;
}

function readForm() {
  return {
    sku: $field('sku').value.trim().toUpperCase(),
    name: $field('name').value.trim(),
    category_id: $field('category_id').value,
    unit: $field('unit').value.trim(),
    priceRaw: $field('price').value.trim(),
    price: Number($field('price').value),
    reorderRaw: $field('reorder_level').value.trim(),
    initialRaw: $field('initial_stock').value.trim(),
  };
}

async function loadCategories() {
  const { data, error } = await db.from('categories').select('id, name').order('name');
  if (error) return showAlert(formAlert, 'danger', friendlyError(error));
  $field('category_id').insertAdjacentHTML(
    'beforeend',
    data.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  );
}

// โหมดแก้ไข: ดึงข้อมูลเดิมมาใส่ฟอร์ม
async function loadProduct() {
  const { data, error } = await db
    .from('products')
    .select('sku, name, category_id, unit, price, reorder_level, stock_quantity')
    .eq('id', editId)
    .maybeSingle();

  if (error) return showAlert(formAlert, 'danger', friendlyError(error));
  if (!data) {
    productForm.hidden = true;
    return showAlert(formAlert, 'danger', 'ไม่พบสินค้านี้ อาจถูกลบไปแล้ว');
  }
  $field('sku').value = data.sku;
  $field('name').value = data.name;
  $field('category_id').value = data.category_id;
  $field('unit').value = data.unit;
  $field('price').value = data.price;
  $field('reorder_level').value = data.reorder_level;
  $field('current_stock').value = `${fmtNumber(data.stock_quantity)} ${data.unit}`;
}

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert(formAlert);
  clearFieldErrors();

  const v = readForm();
  if (!validate(v)) return;

  const row = {
    sku: v.sku,
    name: v.name,
    category_id: Number(v.category_id),
    unit: v.unit,
    price: v.price,
    reorder_level: Number(v.reorderRaw),
  };

  saveBtn.disabled = true;
  saveBtn.textContent = 'กำลังบันทึก…';

  // CREATE หรือ UPDATE
  const { data, error } = isEdit
    ? await db.from('products').update(row).eq('id', editId).select('id').single()
    : await db.from('products').insert(row).select('id').single();

  if (error) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'บันทึก';
    if (error.code === '23505') return setFieldError('sku', 'รหัสสินค้านี้มีอยู่แล้ว ใช้รหัสอื่น');
    return showAlert(formAlert, 'danger', friendlyError(error));
  }

  // สินค้าใหม่ที่มีจำนวนเริ่มต้น: บันทึกเป็นรายการรับเข้า (Trigger จะปรับยอดให้)
  const initial = Number(v.initialRaw);
  if (!isEdit && initial > 0) {
    const { error: stockError } = await db
      .from('stock_transactions')
      .insert({ product_id: data.id, type: 'IN', quantity: initial, note: 'ยอดยกมา' });
    if (stockError) {
      setFlash('warning', `เพิ่มสินค้า ${v.sku} แล้ว แต่บันทึกจำนวนเริ่มต้นไม่สำเร็จ: ${friendlyError(stockError)}`);
      return window.location.assign('products.html');
    }
  }

  setFlash('success', isEdit ? `บันทึกการแก้ไข ${v.sku} แล้ว` : `เพิ่มสินค้า ${v.sku} ${v.name} แล้ว`);
  window.location.assign('products.html');
});

(async function init() {
  const session = await requireLogin();
  renderHeader('products', session.user.email);

  if (isEdit) {
    document.getElementById('form-title').textContent = 'แก้ไขสินค้า';
    document.title = 'แก้ไขสินค้า | ระบบสต็อกสินค้า';
    $field('initial-stock-field').hidden = true;
    $field('current-stock-field').hidden = false;
  }

  await loadCategories();
  if (isEdit) await loadProduct();
})();
