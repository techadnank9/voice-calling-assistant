-- Seed menu for: Mom's Biryani
-- Source: https://momsbiryanica.com/

-- Clear existing menu data before reseeding
delete from menu_items;
delete from menu_categories;

with upsert_categories as (
  insert into menu_categories (name, sort_order, active)
  values
    ('Party Packages', 1, true),
    ('Mom''s Special Combos & Soup', 2, true),
    ('Soups with Garlic Bread', 3, true),
    ('Gongura Biryanis', 4, true),
    ('Dum Biryanis', 5, true),
    ('Tandoori Dishes', 6, true),
    ('Starters', 7, true),
    ('Veg Appetizers', 8, true),
    ('Non Veg Appetizers', 9, true),
    ('Veg Curry', 10, true),
    ('Non-Veg Curry & Platter', 11, true),
    ('Rice and Bread', 12, true),
    ('South Indian', 13, true),
    ('Seafood', 14, true),
    ('Desserts', 15, true),
    ('Beverages', 16, true)
  returning id, name
)
insert into menu_items (category_id, name, description, price_cents, active)
select c.id, v.name, v.description, v.price_cents, true
from upsert_categories c
join (
  values
    ('Party Packages', 'Enjoy Family Party Pack 20-25 People', 'Party pack for 20-25 people.', 29999),
    ('Party Packages', 'Enjoy Family Party Pack 10-12 People', 'Party pack for 10-12 people.', 17599),
    ('Party Packages', 'Enjoy Family Party Pack 5/6 People', 'Party pack for 5-6 people.', 9999),

    ('Mom''s Special Combos & Soup', 'Butter Chicken and Naan Combo', 'Butter chicken served with naan.', 1600),
    ('Mom''s Special Combos & Soup', 'Choice of Biryani with one Tandoori Leg', 'Choice of biryani served with one tandoori chicken leg.', 2000),
    ('Mom''s Special Combos & Soup', 'Mutton Dum Biryani 38Oz', 'Mutton dum biryani, 38oz portion.', 1900),
    ('Mom''s Special Combos & Soup', 'Chicken Dum Biryani 38Oz', 'Chicken dum biryani, 38oz portion.', 1600),

    ('Soups with Garlic Bread', 'Tomato Soup', 'Classic tomato soup served with garlic bread.', 799),
    ('Soups with Garlic Bread', 'Zen Veggie Soup', 'Mixed vegetable soup served with garlic bread.', 799),
    ('Soups with Garlic Bread', 'Homestyle Chicken Soup', 'Homestyle chicken soup served with garlic bread.', 799),
    ('Soups with Garlic Bread', 'Mutton Melt', 'Mutton soup served with garlic bread.', 799),
    ('Soups with Garlic Bread', 'Broccoli Soup', 'Broccoli soup served with garlic bread.', 799),

    ('Gongura Biryanis', 'Gongura Boneless Chicken Dum Biryani', 'Boneless chicken dum biryani with gongura, 38oz.', 1700),
    ('Gongura Biryanis', 'Gongura Mutton Biryani 38Oz', 'Mutton biryani with gongura, 38oz.', 1900),
    ('Gongura Biryanis', 'Gongura Chicken Biryani 38Oz', 'Chicken biryani with gongura, 38oz.', 1600),
    ('Gongura Biryanis', 'Gongura Paneer Dum Biryani 38Oz', 'Paneer dum biryani with gongura, 38oz.', 1600),

    ('Dum Biryanis', 'Shrimp Dum Biryani 38Oz', 'Shrimp dum biryani, 38oz.', 2000),
    ('Dum Biryanis', 'Fish Dum Biryani 38Oz', 'Fish dum biryani, 38oz.', 1800),
    ('Dum Biryanis', 'Mutton Dum Biryani 38Oz', 'Slow-cooked mutton dum biryani, 38oz.', 1900),
    ('Dum Biryanis', 'Boneless Chicken Dum Biryani 38Oz', 'Boneless chicken dum biryani, 38oz.', 1700),
    ('Dum Biryanis', 'Chicken Dum Biryani 38Oz', 'Chicken dum biryani, 38oz.', 1600),
    ('Dum Biryanis', 'Egg Dum Biryani 38Oz', 'Egg dum biryani, 38oz.', 1600),
    ('Dum Biryanis', 'Paneer Dum Biryani 38Oz', 'Paneer dum biryani, 38oz.', 1600),
    ('Dum Biryanis', 'Vegetable Dum Biryani 38Oz', 'Vegetable dum biryani, 38oz.', 1500),

    ('Tandoori Dishes', 'Paneer Tikka', 'Marinated paneer grilled in tandoor.', 1200),
    ('Tandoori Dishes', 'Tandoori Chicken 4 Pieces', 'Four pieces of tandoori chicken.', 1400),
    ('Tandoori Dishes', 'Tandoori Chicken 2 Leg', 'Two tandoori chicken legs.', 1250),
    ('Tandoori Dishes', 'Tandoori Chicken 1 Leg', 'One tandoori chicken leg.', 650),
    ('Tandoori Dishes', 'Shahi Seekh Kebab', 'Royal seekh kebab grilled in tandoor.', 1400),
    ('Tandoori Dishes', 'Mutton Shami Kebab', 'Slow-cooked mutton shami kebab.', 1500),
    ('Tandoori Dishes', 'Chicken Tikka Kabab', 'Marinated chicken tikka grilled in tandoor.', 1400),

    ('Starters', 'Any Kebab', 'Choice of kebab starter.', 1099),
    ('Starters', 'Cheese Omelette', 'Fluffy cheese omelette.', 650),
    ('Starters', 'Masala Omelette', 'Spiced masala omelette.', 750),

    ('Veg Appetizers', 'Cut Mirchi', 'Fried cut chili peppers.', 800),
    ('Veg Appetizers', 'Stuffed Mirchi 5 Pieces', 'Five stuffed chili peppers.', 750),
    ('Veg Appetizers', 'Veg Samosa', 'Crispy vegetable samosas.', 850),
    ('Veg Appetizers', 'Chilli Baby Corn 16Oz', 'Spicy chilli baby corn, 16oz.', 1100),
    ('Veg Appetizers', 'Chilli Paneer 16Oz', 'Spicy chilli paneer, 16oz.', 1200),
    ('Veg Appetizers', 'Baby Corn Manchurian 16Oz', 'Baby corn manchurian, 16oz.', 1100),
    ('Veg Appetizers', 'Paneer Manchurian 16Oz', 'Paneer manchurian, 16oz.', 1200),
    ('Veg Appetizers', 'Gobi Manchurian 16Oz', 'Cauliflower manchurian, 16oz.', 1400),

    ('Non Veg Appetizers', 'Mutton Sukka 16Oz', 'Dry-style mutton sukka, 16oz.', 1700),
    ('Non Veg Appetizers', 'Chicken Sukka 16Oz', 'Dry-style chicken sukka, 16oz.', 1400),
    ('Non Veg Appetizers', 'Mutton Pepper Fry 16Oz', 'Mutton pepper fry, 16oz.', 1700),
    ('Non Veg Appetizers', 'Chicken Pepper Fry 16Oz', 'Chicken pepper fry, 16oz.', 1400),
    ('Non Veg Appetizers', 'Chilli Fish 16Oz', 'Spicy chilli fish, 16oz.', 1400),
    ('Non Veg Appetizers', 'Apollo Fish', 'Crispy apollo fish.', 1500),
    ('Non Veg Appetizers', 'Gazab Ki Galoti', 'Chef''s special melt-in-mouth galoti kebab.', 1500),
    ('Non Veg Appetizers', 'Chilli Chicken 16Oz', 'Spicy chilli chicken, 16oz.', 1400),
    ('Non Veg Appetizers', 'Madras Chicken 65 16Oz', 'Madras style chicken 65, 16oz.', 1400),
    ('Non Veg Appetizers', 'Hyderabadi Chicken 65 16Oz', 'Hyderabadi style chicken 65, 16oz.', 1400),
    ('Non Veg Appetizers', 'Fish Manchurian 16Oz', 'Fish manchurian, 16oz.', 1400),
    ('Non Veg Appetizers', 'Gongura Chicken 16Oz', 'Gongura chicken, 16oz.', 1400),
    ('Non Veg Appetizers', 'Chicken Manchurian 16Oz', 'Chicken manchurian, 16oz.', 1400),

    ('Veg Curry', 'Andhra Dal 16Oz', 'Andhra style dal, 16oz.', 1350),
    ('Veg Curry', 'Mushroom Matar 16Oz', 'Mushroom and peas curry, 16oz.', 1400),
    ('Veg Curry', 'Aloo Gobi Adrak', 'Potato and cauliflower with ginger.', 1300),
    ('Veg Curry', 'Malai Kofta 16Oz', 'Soft cheese dumplings in cream sauce, 16oz.', 1400),
    ('Veg Curry', 'Shahi Veg Curry 16Oz', 'Royal mixed vegetable curry, 16oz.', 1400),
    ('Veg Curry', 'Egg Plant Masala 16Oz', 'Spiced eggplant masala, 16oz.', 1400),
    ('Veg Curry', 'Chana Masala 16Oz', 'Spiced chickpea curry, 16oz.', 1400),
    ('Veg Curry', 'Matar Paneer 16Oz', 'Peas and paneer curry, 16oz.', 1400),
    ('Veg Curry', 'Gongura Paneer 16Oz', 'Paneer in gongura sauce, 16oz.', 1500),
    ('Veg Curry', 'Paneer Chettinad 16Oz', 'Paneer in Chettinad spices, 16oz.', 1400),
    ('Veg Curry', 'Paneer Makhani 16Oz', 'Paneer in buttery tomato sauce, 16oz.', 1400),
    ('Veg Curry', 'Methi Chaman 16Oz', 'Paneer with fenugreek, 16oz.', 1400),
    ('Veg Curry', 'Paneer Lababdar 16Oz', 'Rich paneer curry, 16oz.', 1400),
    ('Veg Curry', 'Methi Matar Malai Saag 16Oz', 'Fenugreek, peas and spinach in cream, 16oz.', 1400),
    ('Veg Curry', 'Palak Paneer 16Oz', 'Spinach and paneer curry, 16oz.', 1400),
    ('Veg Curry', 'Paneer Butter Masala 16Oz', 'Paneer in butter masala sauce, 16oz.', 1400),
    ('Veg Curry', 'Paneer Tikka Masala 16Oz', 'Grilled paneer in tikka masala sauce, 16oz.', 1400),
    ('Veg Curry', 'Pakora Kadi 16Oz', 'Chickpea fritters in yogurt curry, 16oz.', 1300),
    ('Veg Curry', 'Bhindi Masala 16Oz', 'Spiced okra masala, 16oz.', 1400),

    ('Non-Veg Curry & Platter', 'Egg Masala 16Oz', 'Spiced egg masala, 16oz.', 1300),
    ('Non-Veg Curry & Platter', 'Mutton Curry 16Oz', 'Classic mutton curry, 16oz.', 1600),
    ('Non-Veg Curry & Platter', 'Dum Ka Gosht 16Oz', 'Slow-cooked mutton dum style, 16oz.', 1600),
    ('Non-Veg Curry & Platter', 'Mutton Lagan Gosht 16Oz', 'Mutton cooked in a lagan, 16oz.', 1700),
    ('Non-Veg Curry & Platter', 'Mutton Shahi Kurma 16Oz', 'Royal mutton korma, 16oz.', 1600),
    ('Non-Veg Curry & Platter', 'Andhra Mutton Curry 16Oz', 'Andhra style mutton curry, 16oz.', 1600),
    ('Non-Veg Curry & Platter', 'Gongura Mutton Curry 16Oz', 'Mutton curry with gongura, 16oz.', 1700),
    ('Non-Veg Curry & Platter', 'Mutton Chettinad 16Oz', 'Mutton in Chettinad spices, 16oz.', 1600),
    ('Non-Veg Curry & Platter', 'Chicken Chettinad 16Oz', 'Chicken in Chettinad spices, 16oz.', 1400),
    ('Non-Veg Curry & Platter', 'Andhra Chicken Curry 16Oz', 'Andhra style chicken curry, 16oz.', 1500),
    ('Non-Veg Curry & Platter', 'Gongura Murg 16Oz', 'Chicken in gongura sauce, 16oz.', 1500),
    ('Non-Veg Curry & Platter', 'Dum Ka Murg 16Oz', 'Slow-cooked chicken dum style, 16oz.', 1400),
    ('Non-Veg Curry & Platter', 'Chicken Tikka Masala 16Oz', 'Grilled chicken in tikka masala sauce, 16oz.', 1400),
    ('Non-Veg Curry & Platter', 'Murg Saag 16Oz', 'Chicken in spinach sauce, 16oz.', 1500),
    ('Non-Veg Curry & Platter', 'Chicken Curry Bone-in 16Oz', 'Bone-in chicken curry, 16oz.', 1400),
    ('Non-Veg Curry & Platter', 'Butter Chicken Boneless 16Oz', 'Boneless chicken in butter tomato sauce, 16oz.', 1500),
    ('Non-Veg Curry & Platter', 'Chicken Karahi Boneless 16Oz', 'Boneless chicken karahi, 16oz.', 1500),
    ('Non-Veg Curry & Platter', 'Chicken Kofta Boneless 16Oz', 'Boneless chicken kofta curry, 16oz.', 1400),
    ('Non-Veg Curry & Platter', 'Gongura Chicken Curry 16Oz', 'Chicken curry with gongura, 16oz.', 1500),

    ('Rice and Bread', 'Roti Basket', 'Assorted roti basket.', 1900),
    ('Rice and Bread', 'Garlic Naan 2 Pieces', 'Two pieces of garlic naan.', 600),
    ('Rice and Bread', 'Garlic Naan 1 Piece', 'One piece of garlic naan.', 350),
    ('Rice and Bread', 'Bhatura 1 Piece', 'One piece of bhatura.', 550),
    ('Rice and Bread', 'Naan 2 Pieces', 'Two pieces of naan.', 600),
    ('Rice and Bread', 'Naan 1 Piece', 'One piece of naan.', 350),
    ('Rice and Bread', 'Poori 2 Pieces', 'Two pieces of poori.', 700),
    ('Rice and Bread', 'Poori 1 Piece', 'One piece of poori.', 400),
    ('Rice and Bread', 'Lacha Paratha 2 Pieces', 'Two pieces of lacha paratha.', 750),
    ('Rice and Bread', 'Lacha Paratha 1 Piece', 'One piece of lacha paratha.', 400),
    ('Rice and Bread', 'Poori Bhaji', 'Poori served with bhaji.', 1000),
    ('Rice and Bread', 'Chole Batura', 'Chole served with batura.', 1000),
    ('Rice and Bread', 'Chole Poori', 'Chole served with poori.', 1000),
    ('Rice and Bread', 'Korma Paratha', 'Two pieces of Kerala parotta with korma.', 1300),
    ('Rice and Bread', 'Paneer Paratha', 'Paneer stuffed paratha.', 1200),
    ('Rice and Bread', 'Gobi Paratha', 'Cauliflower stuffed paratha.', 1200),
    ('Rice and Bread', 'Aloo Paratha', 'Potato stuffed paratha.', 1100),
    ('Rice and Bread', '2 Rotis', 'Two plain rotis.', 350),
    ('Rice and Bread', '1 Roti', 'One plain roti.', 200),

    ('South Indian', 'Cone Dosa', 'Crispy cone-shaped dosa.', 1200),
    ('South Indian', 'Paneer Dosa', 'Dosa stuffed with spiced paneer.', 1200),
    ('South Indian', 'Chicken Curry Dosa', 'Dosa served with chicken curry.', 1600),
    ('South Indian', 'Mutton Curry Dosa', 'Dosa served with mutton curry.', 1700),
    ('South Indian', 'Ghee Idli', 'Soft idlis topped with ghee.', 900),
    ('South Indian', 'Karapodi Idli', 'Idlis served with spicy karapodi powder.', 850),

    ('Seafood', 'Fish Curry', 'Classic fish curry.', 1400),
    ('Seafood', 'Prawn Curry', 'Classic prawn curry.', 1400),
    ('Seafood', 'Tawa Fish', 'Fish cooked on tawa with spices.', 1500),

    ('Desserts', 'Brownie Sizzler', 'Warm brownie sizzler.', 799),
    ('Desserts', 'Gajar Halwa with Gulab Jamun', 'Carrot halwa served with gulab jamun.', 750),
    ('Desserts', 'Shrikhand', 'Sweetened strained yogurt dessert.', 550),
    ('Desserts', 'Kesari', 'Semolina sweet with saffron.', 550),

    ('Beverages', 'Milkshake', 'Assorted milkshakes.', 899),
    ('Beverages', 'Fruit Punch', 'Fresh fruit punch.', 899),
    ('Beverages', 'Soda', 'Thums Up, Limca, Sprite, or Coke.', 300)
) as v(category_name, name, description, price_cents)
  on c.name = v.category_name;
