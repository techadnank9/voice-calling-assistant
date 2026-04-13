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
  union all
  select 'Vegetarian Curries', 3, true
  where not exists (
    select 1 from menu_categories where name = 'Vegetarian Curries'
  )
  union all
  select 'Tandoori Specialities', 4, true
  where not exists (
    select 1 from menu_categories where name = 'Tandoori Specialities'
  )
  union all
  select 'Rice and Breads', 5, true
  where not exists (
    select 1 from menu_categories where name = 'Rice and Breads'
  )
  union all
  select 'Ranjan''s Specials', 6, true
  where not exists (
    select 1 from menu_categories where name = 'Ranjan''s Specials'
  )
  union all
  select 'Drinks and Desserts', 7, true
  where not exists (
    select 1 from menu_categories where name = 'Drinks and Desserts'
  )
  returning id, name
), all_categories as (
  select id, name from upsert_categories
  union all
  select id, name from menu_categories where name in (
    'Appetizers, Soups & Salads',
    'Curries',
    'Vegetarian Curries',
    'Tandoori Specialities',
    'Rice and Breads',
    'Ranjan''s Specials',
    'Drinks and Desserts'
  )
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
    ('Curries', 'Egg Curry', 'Egg and potatoes in a light curry sauce. Includes rice and nan.', 2200),

    ('Vegetarian Curries', 'Paneer Tikka Masala', 'Paneer cooked in tomato cream sauce flavored with crushed fenugreek leaves. Includes rice and nan.', 2400),
    ('Vegetarian Curries', 'Malai Kofta', 'Croquettes of home-made soft cheese cooked in a creamy sauce with cardamom, cinnamon, cloves and mildly spiced. Includes rice and nan.', 2400),
    ('Vegetarian Curries', 'Mixed Vegetables Curry', 'Combination of cauliflower, beans, carrots, bell peppers, tomatoes and potatoes in a medium sauce. Includes rice and nan.', 2200),
    ('Vegetarian Curries', 'Navarattan Curry', 'Nine vegetables and fruits cooked in cream and mild spices - a historical dish. Includes rice and nan.', 2400),
    ('Vegetarian Curries', 'Vegetable Korma', 'Cooked in coconut milk and very mildly spiced. Includes rice and nan.', 2400),
    ('Vegetarian Curries', 'Alu Gobi', 'Potatoes cooked with onion and mustard. Includes rice and nan.', 2000),
    ('Vegetarian Curries', 'Kali Dal Makhani', 'House specialty. Black lentils harmoniously combined with tomatoes and ginger, simmered overnight on a very slow fire. Includes rice and nan.', 1800),
    ('Vegetarian Curries', 'Yellow Dal Tarka', 'Yellow lentils seasoned with garlic, cumin and cilantro. Includes rice and nan.', 1800),
    ('Vegetarian Curries', 'Channa Masala', 'A Punjabi garbanzo preparation with onion, cilantro, ginger and garam masala. Includes rice and nan.', 2400),
    ('Vegetarian Curries', 'Sag Paneer', 'Spinach cooked with home-made soft cheese, seasoned with garlic. Includes rice and nan.', 2400),
    ('Vegetarian Curries', 'Raitha', 'Home-made yogurt churned with cucumber flakes and studded with roasted cumin.', 800),
    ('Vegetarian Curries', 'Bhindi Masala', 'Okra slow simmered with onions, tomato and cilantro in our custom masala mix. Includes rice and nan.', 2400),

    ('Tandoori Specialities', 'Chicken Tikka', 'Boneless pieces of chicken delicately spiced with mustard, cumin, turmeric, garam masala, lemon juice and cooked in the tandoor. Includes rice and nan.', 2400),
    ('Tandoori Specialities', 'Tandoori Chicken', 'Marinated in yogurt with ginger, garlic, onions and flavor spices. Includes rice and nan.', 2400),
    ('Tandoori Specialities', 'Tandoori Prawn', 'Char-grilled prawn flavored with Indian herbs and spices. Includes rice and nan.', 2800),
    ('Tandoori Specialities', 'Seekh Keebab', 'Spiced lamb rolls prepared over a charcoal fire. Includes rice and nan.', 2400),
    ('Tandoori Specialities', 'Fish Tikka', 'Pieces of salmon lightly spiced and roasted in the tandoor. Includes rice and nan.', 2600),
    ('Tandoori Specialities', 'Paneer Tikka', 'Barbecued chunks of paneer marinated with chat masala.', 2400),
    ('Tandoori Specialities', 'Tandoori Mix Grill', 'Tandoori chicken, tandoori shrimp, chicken tikka, fish tikka and seekh keebab. Includes rice and nan.', 3000),

    ('Rice and Breads', 'Garlic Nan', 'Nan with fresh spiced garlic and cilantro.', 500),
    ('Rice and Breads', 'Nan', 'Leavened soft bread made with flour dough and baked in the tandoor.', 400),
    ('Rice and Breads', 'Cheese Nan', 'Nan stuffed with paneer cheese.', 600),
    ('Rice and Breads', 'Peshwari Nan', 'Nan with fruits and nuts.', 600),
    ('Rice and Breads', 'Keema Kulcha', 'Nan stuffed with ground spiced lamb.', 600),
    ('Rice and Breads', 'Tandoori Roti', 'Basic Indian whole wheat bread.', 400),
    ('Rice and Breads', 'Lucknowi Pullao', 'Saffron flavored basmati rice.', 1100),
    ('Rice and Breads', 'Kashmiri Pullao', 'Saffron flavored rice cooked with pears, peaches, papaya and pineapple.', 1600),
    ('Rice and Breads', 'Pullao Raja', 'Saffron flavored rice with nuts and raisins.', 1800),
    ('Rice and Breads', 'Indian Fried Rice', 'Cooked with a variety of vegetables and eggs.', 1600),
    ('Rice and Breads', 'Chicken Biryani', 'Basmati rice from India cooked with saffron and herbs. Served with raitha - yogurt mixed with cucumber and toasted cumin. Includes nan.', 2800),
    ('Rice and Breads', 'Lamb Biryani', 'Basmati rice from India cooked with saffron and herbs. Served with raitha - yogurt mixed with cucumber and toasted cumin. Includes nan.', 2800),
    ('Rice and Breads', 'Vegetable Biriyani', 'Basmati rice from India cooked with saffron, herbs, and seasonal vegetables. Served with raitha - yogurt mixed with cucumber and toasted cumin. Includes nan.', 1600),
    ('Rice and Breads', 'Onion Kulcha', 'Nan stuffed with chopped onion, green pepper and cilantro.', 500),

    ('Ranjan''s Specials', 'Spicy Madras Tamarind Eggplant', 'Eggplant cooked in tamarind with a delicious sweet and tangy hint of spicy coconut. Includes rice and nan.', 2600),
    ('Ranjan''s Specials', 'Calcutta Lemon Mustard Cauliflower', 'Cauliflower cooked in a flavorful lemon mustard sauce with jalapenos. Includes rice and nan.', 2600),
    ('Ranjan''s Specials', 'Mango Mushroom', 'Indian stir-fried mushroom with Alphonso mango and tropical fruit. Includes rice and nan.', 2600),
    ('Ranjan''s Specials', 'Mumbai Saffron Okra Bhuna', 'Okra slow simmered with saffron, cumin and West Indian spices. Includes rice and nan.', 2600),
    ('Ranjan''s Specials', 'New Delhi Green Bean Ferezi', 'Green beans seasoned with garlic pepper and tomatoes. Includes rice and nan.', 2600),

    ('Drinks and Desserts', 'Chai', 'Hot Indian spiced milk tea.', 500),
    ('Drinks and Desserts', 'Mango Lassi', 'A refreshing drink with home-made yogurt and Indian alphonso mango pulp.', 500),
    ('Drinks and Desserts', 'Gulab Jamun', 'Soft milk dumplings soaked in warm cardamom syrup.', 600),
    ('Drinks and Desserts', 'Mango Rice Pudding', 'Delicious rice pudding with Alfanso mango float.', 600),
    ('Drinks and Desserts', 'Rasmalai', 'Milk dumplings soaked in sweetened pistachio milk reduction and served chilled.', 600),
    ('Drinks and Desserts', 'Nimbu Pan', 'A popular Indian style sparkling lemonade with lemon, lime and rose water.', 500)
) as v(category_name, name, description, price_cents)
  on c.name = v.category_name
where not exists (
  select 1 from menu_items mi where mi.name = v.name
);
