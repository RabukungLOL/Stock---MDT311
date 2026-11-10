// คัดลอกไฟล์นี้แล้วตั้งชื่อใหม่เป็น config.js (อยู่โฟลเดอร์เดียวกัน) แล้วใส่ค่าของโปรเจกต์
// หาค่าได้ที่ Supabase > Project Settings > API Keys
//
// SUPABASE_KEY ใช้ "Publishable key" (ขึ้นต้นด้วย sb_publishable_) หรือ "anon public key" แบบเดิมก็ได้
// คีย์นี้ใส่ในหน้าเว็บได้ เพราะสิทธิ์ถูกคุมด้วย RLS ในฐานข้อมูล
// ห้ามใส่ Secret key หรือ service_role key ในไฟล์นี้เด็ดขาด
window.APP_CONFIG = {
  SUPABASE_URL: 'https://emacxjszhjivjahrzhdk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_RK3aVw8hyfhgolHBp2wDdw_jObOxCaH',
};
