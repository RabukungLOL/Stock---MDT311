-- =====================================================================
-- ระบบสต็อกสินค้า (Stock Management System) — โครงสร้างฐานข้อมูลบน Supabase
-- วิธีใช้: เปิด Supabase > SQL Editor > New query > วางทั้งไฟล์ > กด Run
-- ไฟล์นี้สร้างครบ: ตาราง 3 ชุด, เงื่อนไขข้อมูล, Trigger ตัดสต็อก, สิทธิ์ (RLS) และข้อมูลตัวอย่าง
-- =====================================================================

-- ถ้าเคยสร้างตารางชื่อเดียวกันไว้แล้ว (เช่น สร้างจาก Table Editor) และอยากเริ่มใหม่
-- ให้ลบเครื่องหมาย -- หน้า 3 บรรทัดด้านล่างออกก่อนกด Run (ข้อมูลเดิมจะหายทั้งหมด)
-- drop table if exists public.stock_transactions cascade;
-- drop table if exists public.products cascade;
-- drop table if exists public.categories cascade;


-- ---------------------------------------------------------------------
-- 1) ตาราง categories : หมวดหมู่สินค้า
-- ---------------------------------------------------------------------
create table public.categories (
  id          bigint generated always as identity primary key,
  name        text not null unique check (length(trim(name)) > 0),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) ตาราง products : ข้อมูลสินค้า (ชุดข้อมูลหลักที่ใช้สาธิต CRUD)
--    stock_quantity แก้ตรงไม่ได้ จะเปลี่ยนผ่าน stock_transactions เท่านั้น
-- ---------------------------------------------------------------------
create table public.products (
  id              bigint generated always as identity primary key,
  sku             text not null unique check (length(trim(sku)) > 0),
  name            text not null check (length(trim(name)) > 0),
  category_id     bigint not null references public.categories(id) on delete restrict,
  unit            text not null default 'ชิ้น',
  price           numeric(10,2) not null default 0 check (price >= 0),
  stock_quantity  integer not null default 0 check (stock_quantity >= 0),
  reorder_level   integer not null default 10 check (reorder_level >= 0),
  is_low_stock    boolean generated always as (stock_quantity <= reorder_level) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) ตาราง stock_transactions : ประวัติรับเข้า (IN) / เบิกออก (OUT)
--    บันทึกแล้วแก้ไขหรือลบไม่ได้ เพื่อให้ตรวจสอบย้อนหลังได้เสมอ
-- ---------------------------------------------------------------------
create table public.stock_transactions (
  id                bigint generated always as identity primary key,
  product_id        bigint not null references public.products(id) on delete restrict,
  type              text not null check (type in ('IN', 'OUT')),
  quantity          integer not null check (quantity > 0),
  note              text,
  created_by        uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_email  text default (auth.jwt() ->> 'email'),
  created_at        timestamptz not null default now()
);

create index stock_transactions_product_id_idx on public.stock_transactions (product_id);
create index products_category_id_idx on public.products (category_id);


-- ---------------------------------------------------------------------
-- 4) Trigger: เมื่อเพิ่มรายการใน stock_transactions ให้ปรับยอดใน products อัตโนมัติ
--    ทำงานใน Transaction เดียวกับการ INSERT ถ้าเบิกเกินยอด จะยกเลิกทั้งรายการ
-- ---------------------------------------------------------------------
create or replace function public.apply_stock_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty integer;
begin
  -- ล็อกแถวสินค้าไว้ กันกรณีสองคนเบิกพร้อมกัน
  select stock_quantity into current_qty
  from public.products
  where id = new.product_id
  for update;

  if not found then
    raise exception 'ไม่พบสินค้า id %', new.product_id;
  end if;

  if new.type = 'OUT' and current_qty < new.quantity then
    raise exception 'สต็อกไม่พอ: คงเหลือ % แต่ต้องการเบิก %', current_qty, new.quantity;
  end if;

  update public.products
  set stock_quantity = stock_quantity
        + case when new.type = 'IN' then new.quantity else -new.quantity end,
      updated_at = now()
  where id = new.product_id;

  return new;
end;
$$;

create trigger trg_apply_stock_transaction
before insert on public.stock_transactions
for each row execute function public.apply_stock_transaction();

-- อัปเดตเวลาแก้ไขล่าสุดของสินค้าอัตโนมัติ
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 5) สิทธิ์การเข้าถึง
--    - anon (ยังไม่ล็อกอิน): เข้าถึงอะไรไม่ได้เลย
--    - authenticated (ล็อกอินแล้ว): จัดการข้อมูลได้ แต่แก้ stock_quantity ตรงไม่ได้
--      และแก้/ลบประวัติ stock_transactions ไม่ได้
-- ---------------------------------------------------------------------
revoke all on public.categories, public.products, public.stock_transactions from anon, authenticated;

grant select, insert, update, delete on public.categories to authenticated;

grant select, delete on public.products to authenticated;
grant insert (sku, name, category_id, unit, price, reorder_level) on public.products to authenticated;
grant update (sku, name, category_id, unit, price, reorder_level) on public.products to authenticated;

grant select on public.stock_transactions to authenticated;
grant insert (product_id, type, quantity, note) on public.stock_transactions to authenticated;

-- Row Level Security (RLS)
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.stock_transactions enable row level security;

create policy "logged-in users can read categories" on public.categories
  for select to authenticated using (true);
create policy "logged-in users can add categories" on public.categories
  for insert to authenticated with check (true);
create policy "logged-in users can edit categories" on public.categories
  for update to authenticated using (true) with check (true);
create policy "logged-in users can delete categories" on public.categories
  for delete to authenticated using (true);

create policy "logged-in users can read products" on public.products
  for select to authenticated using (true);
create policy "logged-in users can add products" on public.products
  for insert to authenticated with check (true);
create policy "logged-in users can edit products" on public.products
  for update to authenticated using (true) with check (true);
create policy "logged-in users can delete products" on public.products
  for delete to authenticated using (true);

create policy "logged-in users can read transactions" on public.stock_transactions
  for select to authenticated using (true);
create policy "logged-in users can add transactions" on public.stock_transactions
  for insert to authenticated with check (true);
-- ไม่มี policy สำหรับ update/delete = ไม่มีใครแก้หรือลบประวัติได้


-- ---------------------------------------------------------------------
-- 6) ข้อมูลตัวอย่าง (3 หมวดหมู่ + 10 สินค้า + 15 รายการเคลื่อนไหว)
--    ยอดคงเหลือเริ่มที่ 0 แล้วให้ Trigger คำนวณจากรายการรับเข้า/เบิกออก
-- ---------------------------------------------------------------------
insert into public.categories (name) values
  ('เครื่องดื่ม'),
  ('อาหารแห้ง'),
  ('ของใช้ในบ้าน');

insert into public.products (sku, name, category_id, unit, price, reorder_level)
select v.sku, v.name, c.id, v.unit, v.price, v.reorder_level
from (values
  ('DRK-001', 'น้ำดื่ม 600 มล.',        'เครื่องดื่ม',  'ขวด',   7.00,  30),
  ('DRK-002', 'ชาเขียว 500 มล.',        'เครื่องดื่ม',  'ขวด',  20.00,  20),
  ('DRK-003', 'กาแฟกระป๋อง 180 มล.',    'เครื่องดื่ม',  'กระป๋อง', 15.00, 24),
  ('DRK-004', 'น้ำอัดลม 325 มล.',       'เครื่องดื่ม',  'กระป๋อง', 17.00, 24),
  ('FOD-001', 'บะหมี่กึ่งสำเร็จรูป',     'อาหารแห้ง',   'ซอง',    7.00,  50),
  ('FOD-002', 'ปลากระป๋อง 155 กรัม',    'อาหารแห้ง',   'กระป๋อง', 22.00, 20),
  ('FOD-003', 'ข้าวสารหอมมะลิ 5 กก.',   'อาหารแห้ง',   'ถุง',  189.00,   5),
  ('HOM-001', 'สบู่ก้อน 70 กรัม',       'ของใช้ในบ้าน', 'ก้อน',  15.00,  12),
  ('HOM-002', 'ยาสีฟัน 150 กรัม',       'ของใช้ในบ้าน', 'หลอด',  45.00,  10),
  ('HOM-003', 'กระดาษทิชชู แพ็ก 6 ม้วน', 'ของใช้ในบ้าน', 'แพ็ก',  89.00,   8)
) as v(sku, name, category, unit, price, reorder_level)
join public.categories c on c.name = v.category
order by v.sku;

-- รับสินค้าเข้า (ยอดยกมา)
insert into public.stock_transactions (product_id, type, quantity, note)
select p.id, 'IN', v.qty, 'ยอดยกมา'
from (values
  ('DRK-001', 120), ('DRK-002', 48), ('DRK-003', 60), ('DRK-004', 30),
  ('FOD-001', 200), ('FOD-002', 40), ('FOD-003', 12), ('HOM-001', 36),
  ('HOM-002', 24), ('HOM-003', 20)
) as v(sku, qty)
join public.products p on p.sku = v.sku
order by v.sku;

-- เบิกสินค้าออก (ทำหลังรับเข้า เพื่อให้ยอดพอ)
insert into public.stock_transactions (product_id, type, quantity, note)
select p.id, 'OUT', v.qty, v.note
from (values
  ('DRK-001', 95, 'ขายหน้าร้าน'),
  ('DRK-004', 10, 'ขายหน้าร้าน'),
  ('FOD-003',  9, 'ขายหน้าร้าน'),
  ('HOM-001', 30, 'เบิกใช้ในสำนักงาน'),
  ('HOM-003',  4, 'ขายหน้าร้าน')
) as v(sku, qty, note)
join public.products p on p.sku = v.sku
order by v.sku;
