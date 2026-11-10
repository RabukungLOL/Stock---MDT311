// ฟังก์ชันที่ทุกหน้าใช้ร่วมกัน: เชื่อมต่อ Supabase, ตรวจการล็อกอิน, เมนู, แปลงข้อความ error

const cfg = window.APP_CONFIG;
if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT-ID')) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div class="alert alert-danger config-missing">ยังไม่ได้ตั้งค่าการเชื่อมต่อ: คัดลอก <code>js/config.example.js</code> เป็น <code>js/config.js</code> แล้วใส่ Project URL และ Key ของ Supabase</div>'
    );
  });
  throw new Error('Missing js/config.js');
}

// ตัวเชื่อมต่อ Supabase ใช้ชื่อ db (ชื่อ supabase เป็นของไลบรารี)
const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

// ---------- การล็อกอิน ----------
async function requireLogin() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    window.location.replace('index.html');
    return new Promise(() => {}); // หยุดรอระหว่างเปลี่ยนหน้า
  }
  return data.session;
}

async function logout() {
  await db.auth.signOut();
  window.location.replace('index.html');
}

// ---------- เมนูด้านบน ----------
function renderHeader(activePage, email) {
  const links = [
    { href: 'products.html', key: 'products', label: 'สินค้า' },
    { href: 'stock.html', key: 'stock', label: 'รับเข้า / เบิกออก' },
    { href: 'history.html', key: 'history', label: 'ประวัติ' },
  ];
  const nav = links
    .map((l) => `<a href="${l.href}" class="${l.key === activePage ? 'active' : ''}">${l.label}</a>`)
    .join('');
  document.getElementById('app-header').innerHTML = `
    <div class="header-inner">
      <a class="brand" href="products.html"><span class="brand-mark">S</span>ระบบสต็อกสินค้า</a>
      <nav class="main-nav">${nav}</nav>
      <div class="user-box">
        <span class="user-email">${escapeHtml(email)}</span>
        <button type="button" class="btn btn-ghost btn-sm" id="logout-btn">ออกจากระบบ</button>
      </div>
    </div>`;
  document.getElementById('logout-btn').addEventListener('click', logout);
}

// ---------- ข้อความแจ้งเตือน ----------
function showAlert(container, type, message) {
  container.innerHTML = `<div class="alert alert-${type}" role="alert">${escapeHtml(message)}</div>`;
  container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function clearAlert(container) {
  container.innerHTML = '';
}

// ส่งข้อความข้ามหน้า (เช่น บันทึกเสร็จแล้วกลับไปหน้ารายการ)
function setFlash(type, message) {
  sessionStorage.setItem('flash', JSON.stringify({ type, message }));
}

function showFlash(container) {
  const raw = sessionStorage.getItem('flash');
  if (!raw) return;
  sessionStorage.removeItem('flash');
  const { type, message } = JSON.parse(raw);
  showAlert(container, type, message);
}

// แปลง error จาก Supabase/PostgreSQL เป็นข้อความภาษาไทย
function friendlyError(error) {
  if (!error) return '';
  switch (error.code) {
    case '23505':
      return 'ข้อมูลนี้มีอยู่แล้วในระบบ (ห้ามซ้ำ)';
    case '23503':
      return 'ทำรายการไม่ได้ เพราะข้อมูลนี้ถูกใช้อ้างอิงอยู่ในตารางอื่น';
    case '23514':
      return 'ข้อมูลไม่ผ่านเงื่อนไขของฐานข้อมูล เช่น ตัวเลขติดลบหรือเป็นศูนย์';
    case '23502':
      return 'กรอกข้อมูลที่จำเป็นไม่ครบ';
    case 'P0001':
      return error.message; // ข้อความจาก Trigger เช่น "สต็อกไม่พอ: ..."
    case '42501':
      return 'ไม่มีสิทธิ์ทำรายการนี้ (ตรวจสอบการล็อกอินหรือสิทธิ์ RLS)';
    case 'PGRST301':
    case 'PGRST303':
      return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    default:
      return 'เกิดข้อผิดพลาด: ' + (error.message || 'ไม่ทราบสาเหตุ');
  }
}

// ---------- จัดรูปแบบข้อมูล ----------
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNumber(n) {
  return Number(n || 0).toLocaleString('th-TH');
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function stockBadge(p) {
  if (p.stock_quantity === 0) return '<span class="badge badge-danger">หมด</span>';
  if (p.is_low_stock) return '<span class="badge badge-warning">ใกล้หมด</span>';
  return '<span class="badge badge-success">ปกติ</span>';
}

function typeBadge(type) {
  return type === 'IN'
    ? '<span class="badge badge-in">รับเข้า</span>'
    : '<span class="badge badge-out">เบิกออก</span>';
}

// ตัดอักขระที่มีความหมายพิเศษในตัวกรองของ Supabase ออก
function cleanSearch(text) {
  return text.replace(/[,()%*\\]/g, ' ').trim();
}

function isNonNegativeInt(v) {
  return /^\d+$/.test(String(v).trim());
}
