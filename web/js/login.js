// หน้าเข้าสู่ระบบ: ใช้ Supabase Auth (อีเมล + รหัสผ่าน)

const loginForm = document.getElementById('login-form');
const loginAlert = document.getElementById('alert-box');
const loginBtn = document.getElementById('login-btn');

// ถ้าล็อกอินค้างไว้แล้ว ไปหน้ารายการสินค้าเลย
db.auth.getSession().then(({ data }) => {
  if (data.session) window.location.replace('products.html');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert(loginAlert);

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) {
    showAlert(loginAlert, 'danger', 'กรอกอีเมลและรหัสผ่านให้ครบ');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'กำลังเข้าสู่ระบบ…';

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showAlert(loginAlert, 'danger', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    loginBtn.disabled = false;
    loginBtn.textContent = 'เข้าสู่ระบบ';
    return;
  }
  window.location.replace('products.html');
});
