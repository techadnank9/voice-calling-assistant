-- Seed menu for: New Delhi Restaurant (Uber Eats SF listing)
-- Source link: https://www.ubereats.com/store/new-delhi-restaurant/unssERUkT1iFmV8fekvYAg

with upsert_categories as (
  insert into menu_categories (name, sort_order, active)
  select 'Appetizers, Soups & Salads', 1, true
  where not exists (
    select 1 from menu_categories where name = 'Appetizers, Soups & Salads'
  )
  union all
  select 'Curries', 2, true
  where not exists (
    select 1 from menu_categories where name = 'Curries'
  )
  returning id, name
), all_categories as (
  select id, name from upsert_categories
  union all
  select id, name from menu_categories where name in ('Appetizers, Soups & Salads', 'Curries')
)
insert into menu_items (category_id, name, description, price_cents, active)
select c.id, v.name, v.description, v.price_cents, true
from all_categories c
join (
  values
    ('Appetizers, Soups & Salads', 'Samosa', 'Crispy turnovers filled with lightly spiced potatoes and green peas.', 1000),
    ('Appetizers, Soups & Salads', 'Bari Pakoras', 'Mixed vegetable lentil fritters.', 1000),
    ('Appetizers, Soups & Salads', 'Samosa Chana Chat', 'Deconstructed vegetarian samosas with garbanzo, onion, cilantro, jalapenos, tomatoes and chutney.', 1500),
    ('Appetizers, Soups & Salads', 'Chili Cheese Pakora', 'Spiced paneer and green chili lentil fritters.', 1000),
    ('Appetizers, Soups & Salads', 'Chicken Pakoras', 'Flavorful chicken tenders.', 1100),
    ('Appetizers, Soups & Salads', 'Assorted Vegetable Platter', 'Combination of samosa, bari pakora, chili cheese pakora and papadum.', 1600),
    ('Appetizers, Soups & Salads', 'Assorted Tandoori Platter', 'Combination of chicken tikka, seekh kebab and tandoori prawn.', 2000),
    ('Appetizers, Soups & Salads', 'Condiments', 'Onions, lemon, pepper and achar.', 500),
    ('Appetizers, Soups & Salads', 'Hot Sauce', 'Very spicy house hot sauce.', 500),

    ('Curries', 'Butter Chicken', 'Punjabi style tandoori chicken in tomato butter-cream sauce. Includes rice and nan.', 2800),
    ('Curries', 'Chicken Tikka Masala', 'Cooked in tomato cream sauce flavored with fenugreek. Includes rice and nan.', 2800),
    ('Curries', 'Chicken Curry', 'Chicken cooked with onion, ginger, garlic, turmeric and Indian spices. Includes rice and nan.', 2600),
    ('Curries', 'Lamb Curry', 'Lamb cooked with onion, ginger, garlic, turmeric and Indian spices. Includes rice and nan.', 2400),
    ('Curries', 'Lamb Vindaloo', 'Spicy hot lamb curry with potatoes. Includes rice and nan.', 2800),
    ('Curries', 'Chicken Korma', 'Chicken cooked in coconut with mild spices. Includes rice and nan.', 2600),
    ('Curries', 'Lamb Korma', 'Lamb cooked in coconut milk and mild spices. Includes rice and nan.', 2600),
    ('Curries', 'Rogan Josh', 'Lamb curry cooked in North Indian spices and herbs. Includes rice and nan.', 2600),
    ('Curries', 'Chicken Vindaloo', 'Spicy hot chicken curry with potatoes. Includes rice and nan.', 2800),
    ('Curries', 'Egg Curry', 'Egg and potatoes in a light curry sauce. Includes rice and nan.', 2200)
) as v(category_name, name, description, price_cents)
  on c.name = v.category_name
where not exists (
  select 1 from menu_items mi where mi.name = v.name
);
