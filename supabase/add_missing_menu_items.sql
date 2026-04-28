-- ============================================================
-- Add missing menu items from the Mom's Biryani knowledge base
-- Safe to run multiple times: inserts only if name doesn't exist.
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

do $$
declare
  cat_desserts    uuid;
  cat_beverages   uuid;
  cat_south_indian uuid;
  cat_seafood     uuid;
  cat_rice_bread  uuid;
  cat_combos      uuid;
  cat_wraps       uuid;
  cat_extras      uuid;
begin

  -- ── Resolve category IDs ────────────────────────────────────
  select id into cat_desserts    from menu_categories where name = 'Desserts'     limit 1;
  select id into cat_beverages   from menu_categories where name = 'Beverages'    limit 1;
  select id into cat_south_indian from menu_categories where name = 'South Indian' limit 1;
  select id into cat_seafood     from menu_categories where name = 'Seafood'      limit 1;
  select id into cat_rice_bread  from menu_categories where name = 'Rice and Bread' limit 1;
  select id into cat_combos      from menu_categories where name = 'Mom''s Special Combos & Soup' limit 1;

  -- Create any categories that don't exist yet
  if cat_wraps is null then
    insert into menu_categories (name, sort_order, active)
    values ('Wraps & Sides', 17, true)
    returning id into cat_wraps;
  end if;

  -- ── DESSERTS ────────────────────────────────────────────────
  insert into menu_items (category_id, name, description, price_cents, active)
  select cat_desserts, v.name, v.desc, v.price, true
  from (values
    ('Firni',        'Light creamy rice and milk pudding slow-cooked over a low fire.', 450),
    ('Gajar Halwa',  'Slow-cooked carrot pudding garnished with pistachios and cream.',  550),
    ('Gulab Jamun',  'Soft spongy milk-based dumplings in sweet syrup.',                550)
  ) as v(name, desc, price)
  where not exists (
    select 1 from menu_items where lower(name) = lower(v.name)
  );

  -- ── BEVERAGES — Individual milkshakes ───────────────────────
  insert into menu_items (category_id, name, description, price_cents, active)
  select cat_beverages, v.name, v.desc, v.price, true
  from (values
    ('Banana Milkshake',         'Creamy milkshake with ripe bananas and chilled milk.',         899),
    ('Chikoo Milkshake',         'Sapodilla fruit milkshake.',                                   899),
    ('Custard Apple Milkshake',  'Naturally sweet refreshing tropical milkshake.',               899),
    ('Mixed Berries Milkshake',  'Creamy mixed berries milkshake.',                             899),
    ('Mixed Fruit Punch',        'Fresh mixed fruit punch.',                                     899),
    ('Mango Lassi',              'Yogurt drink with pureed mango and cardamom.',                 550),
    ('Rose Milk',                'Rose water and cardamom flavored chilled milk.',               550),
    ('Butter Milk',              'Creamy salted yogurt drink with crushed cumin (Chaas).',       550),
    ('Kokam Sharbat',            'Tangy-sweet kokam fruit drink.',                               550),
    ('Nimbu Pani',               'Fresh lemonade with lemon juice, sugar, and a pinch of salt.', 500),
    ('Lime Soda',                'Fresh lime juice with soda water and sugar.',                   500),
    ('Coke',                     'Coca-Cola.',                                                   250),
    ('Diet Coke',                'Diet Coca-Cola.',                                              250),
    ('Sprite',                   'Sprite lemon-lime soda.',                                      250),
    ('Sprite Diet',              'Diet Sprite.',                                                  250),
    ('Thums Up',                 'Indian cola.',                                                  350),
    ('Limca',                    'Indian lemon-lime soda.',                                       350),
    ('Fanta',                    'Fruity carbonated drink.',                                      350)
  ) as v(name, desc, price)
  where not exists (
    select 1 from menu_items where lower(name) = lower(v.name)
  );

  -- ── SOUTH INDIAN — Dosas ────────────────────────────────────
  insert into menu_items (category_id, name, description, price_cents, active)
  select cat_south_indian, v.name, v.desc, v.price, true
  from (values
    ('Plain Dosa',              'Thin crispy fermented rice and urad dal crepe. Served with sambar and chutneys.',   850),
    ('Podi Dosa',               'Crispy dosa sprinkled with podi spice powder. Served with sambar and chutneys.',   950),
    ('Ghee Dosa',               'Dosa cooked with generous ghee. Served with sambar and chutneys.',               1100),
    ('Benne Dosa',              'Buttery South Indian-style dosa. Served with sambar and chutneys.',              1100),
    ('Onion Dosa',              'Crispy dosa with finely chopped onions. Served with sambar and chutneys.',       1200),
    ('Cheese Dosa',             'Fusion dosa layered with melted cheese. Served with sambar and chutneys.',       1200),
    ('Masala Dosa',             'Dosa with fragrant spiced mashed potato filling. Served with sambar and chutneys.', 1200),
    ('Mysore Masala Dosa',      'Dosa smeared with spicy red chutney and potato filling.',                        1250),
    ('Mom''s Special Chicken Curry Dosa', 'Chicken curry served with crispy dosa — mom''s signature comfort.', 1600),
    ('Mom''s Special Mutton Curry Dosa',  'Flavorful mutton curry served with crispy dosa.',                  1700)
  ) as v(name, desc, price)
  where not exists (
    select 1 from menu_items where lower(name) = lower(v.name)
  );

  -- ── SOUTH INDIAN — Idlis & Uthappam ─────────────────────────
  insert into menu_items (category_id, name, description, price_cents, active)
  select cat_south_indian, v.name, v.desc, v.price, true
  from (values
    ('Special Idli',                     'Soft steamed rice cakes served with tangy sambar and chutney.',               700),
    ('Dawangiri Special Benne Idli',     'Idlis enriched with Dawangiri-style special butter.',                        1000),
    ('Idli with Chicken Curry',          'Soft idlis served with savory chicken curry.',                               1500),
    ('Idli with Fish Curry',             'Soft idlis served with simple flavorful fish curry.',                        1600),
    ('Idli with Goat Curry',             'Soft idlis served with mutton gravy.',                                       1600),
    ('Mini Uttapam',                     'Bite-sized rice pancakes topped with veggies. Served with sambar.',          1200),
    ('Onion Uttapam',                    'Thick rice pancake layered with onions. Served with sambar and chutneys.',   1300)
  ) as v(name, desc, price)
  where not exists (
    select 1 from menu_items where lower(name) = lower(v.name)
  );

  -- ── SEAFOOD — missing items ──────────────────────────────────
  insert into menu_items (category_id, name, description, price_cents, active)
  select cat_seafood, v.name, v.desc, v.price, true
  from (values
    ('Pamplona Fish', 'Tender fish fillets with Mediterranean-style flair.', 1600)
  ) as v(name, desc, price)
  where not exists (
    select 1 from menu_items where lower(name) = lower(v.name)
  );

  -- ── RICE & BREAD — missing items ────────────────────────────
  insert into menu_items (category_id, name, description, price_cents, active)
  select cat_rice_bread, v.name, v.desc, v.price, true
  from (values
    ('Extra Long Basmati Rice', 'Plain basmati rice, perfect with curries (16 oz).', 350),
    ('Saffron Rice',            'Saffron-infused basmati rice.',                      499),
    ('Chapati',                 'Thin whole wheat flatbread (4 pieces).',             100)
  ) as v(name, desc, price)
  where not exists (
    select 1 from menu_items where lower(name) = lower(v.name)
  );

  -- ── COMBOS — Valentine Box ───────────────────────────────────
  insert into menu_items (category_id, name, description, price_cents, active)
  select cat_combos, v.name, v.desc, v.price, true
  from (values
    ('Valentine Box', 'Saffron-infused rice (8 oz) paired with a tender seasoned chicken dish.', 1099)
  ) as v(name, desc, price)
  where not exists (
    select 1 from menu_items where lower(name) = lower(v.name)
  );

  -- ── WRAPS & SIDES ────────────────────────────────────────────
  insert into menu_items (category_id, name, description, price_cents, active)
  select cat_wraps, v.name, v.desc, v.price, true
  from (values
    ('Butter Chicken Wrap', 'Tender creamy butter chicken with fresh veggies in soft flatbread.', 1100),
    ('Sauce',               'Side sauce.',                                                          209),
    ('Salad',               'Cucumber and tomato salad.',                                           449),
    ('Chicken Leg',         'Single chicken leg.',                                                  499)
  ) as v(name, desc, price)
  where not exists (
    select 1 from menu_items where lower(name) = lower(v.name)
  );

  raise notice 'Menu migration complete.';
end $$;
