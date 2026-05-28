const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'backseat-barista-secret-2025';
const DB_PATH = './.backseat.db';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');
[publicDir, uploadsDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
app.use(express.static(publicDir));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// MENGGUNAKAN SQL.JS PERSIS SEPERTI ABU FARM
let db;
function saveDb() { fs.writeFile(DB_PATH, Buffer.from(db.export()), err => { if (err) console.error(err); }); }
function run(sql, params = []) { db.run(sql, params); saveDb(); }
function get(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; } stmt.free(); return null; }
function all(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); const res = []; while (stmt.step()) res.push(stmt.getAsObject()); stmt.free(); return res; }

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) { db = new SQL.Database(fs.readFileSync(DB_PATH)); console.log('✅ Database Dimuat'); }
  else { db = new SQL.Database(); console.log('✅ Database Baru Dibuat'); }

  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, phone TEXT, address TEXT, role TEXT DEFAULT 'customer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL, category TEXT DEFAULT 'Kopi', image_url TEXT, stock INTEGER DEFAULT 10, is_active INTEGER DEFAULT 1, is_bestseller INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS cart (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, quantity INTEGER DEFAULT 1, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(product_id) REFERENCES products(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, UNIQUE(user_id, product_id))`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE, user_id INTEGER, total_price INTEGER, status TEXT DEFAULT 'Menunggu Pembayaran', payment_proof TEXT, reject_reason TEXT, delivery_address TEXT, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, product_id INTEGER, quantity INTEGER, price INTEGER, product_name TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS collaborations (id INTEGER PRIMARY KEY AUTOINCREMENT, business_name TEXT, product_type TEXT, contact TEXT, message TEXT, status TEXT DEFAULT 'Pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  if (!get("SELECT id FROM users WHERE role='owner'")) {
    const hash = bcrypt.hashSync('owner123', 10);
    run("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)", ['Fathia Adhiana', 'fathia@backseat.com', hash, 'owner']);
  }
  if (!get("SELECT id FROM users WHERE role='admin'")) {
    const hash = bcrypt.hashSync('admin123', 10);
    run("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)", ['Admin Backseat', 'admin@backseat.com', hash, 'admin']);
  }

  if (!get("SELECT id FROM products LIMIT 1")) {
    const products = [
      ['Iced Palm Sugar Latte', 'Latte manis dengan gula aren asli, disajikan dingin. Perpaduan espresso premium dengan susu segar dan gula aren pilihan.', 28000, 'Kopi', 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500', 15, 1, 1],
      ['Cold Brew Classic', 'Cold brew 12 jam dengan biji kopi pilihan. Rasa bold, smooth, dan segar sempurna untuk hari panas.', 25000, 'Kopi', 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500', 12, 1, 1],
      ['Caramel Latte', 'Espresso dengan susu steamed dan siroop karamel homemade. Manis, creamy, dan memanjakan lidah.', 30000, 'Kopi', 'https://images.unsplash.com/photo-1572286258217-215cf8e923f1?w=500', 10, 1, 0],
      ['Matcha Latte', 'Matcha grade A dari Jepang dengan susu full cream. Earthy, creamy, dan penuh antioksidan.', 27000, 'Non-Kopi', 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500', 8, 1, 1],
      ['Thai Tea Special', 'Thai tea otentik dengan campuran rempah pilihan, disajikan dengan susu evaporasi dan es melimpah.', 22000, 'Non-Kopi', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500', 20, 1, 0],
      ['Taro Milk Tea', 'Minuman talas ungu creamy dengan bubble pearl, cocok untuk semua kalangan.', 24000, 'Non-Kopi', 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=500', 15, 1, 0],
      ['Espresso Shot', 'Double shot espresso dari biji kopi single origin Toraja. Intense, bold, dan bersih di palat.', 18000, 'Kopi', 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=500', 25, 1, 0],
      ['Chocolate Frappe', 'Blended chocolate dengan whipped cream dan cokelat drizzle. Dessert drink yang menggiurkan.', 32000, 'Non-Kopi', 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500', 10, 1, 0],
      ['Avocado Coffee', 'Perpaduan unik alpukat creamy dengan espresso. Kaya lemak sehat dan penuh energi.', 35000, 'Kopi', 'https://images.unsplash.com/photo-1592334873219-f6729cbfb501?w=500', 8, 1, 1],
      ['Lemon Mojito', 'Mocktail segar dengan lemon, mint, dan soda. Pilihan tepat untuk yang tidak suka kafein.', 20000, 'Non-Kopi', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500', 18, 1, 0],
    ];
    for (const p of products) {
      db.run("INSERT INTO products (name,description,price,category,image_url,stock,is_active,is_bestseller) VALUES (?,?,?,?,?,?,?,?)", p);
    }
  }
  saveDb();
}

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Akses ditolak' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Sesi habis, silakan login kembali' }); }
};
const ownerOnly = (req, res, next) => {
  auth(req, res, () => {
    if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    next();
  });
};

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
  if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });
  if (get("SELECT id FROM users WHERE email=?", [email])) return res.status(400).json({ error: 'Email sudah terdaftar' });
  run("INSERT INTO users (name,email,password,phone,address) VALUES (?,?,?,?,?)", [name, email, bcrypt.hashSync(password, 10), phone || '', address || '']);
  res.json({ success: true, message: 'Registrasi berhasil' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const u = get("SELECT * FROM users WHERE email=?", [email]);
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Email atau password salah' });
  const token = jwt.sign({ id: u.id, role: u.role, name: u.name, email: u.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

app.post('/api/upload', ownerOnly, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

app.post('/api/upload/payment', auth, upload.single('proof'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

app.get('/api/products', (req, res) => {
  try {
    const { category, search } = req.query;
    let sql = "SELECT * FROM products WHERE is_active=1";
    const params = [];
    if (category && category !== 'Semua') { sql += " AND category=?"; params.push(category); }
    if (search) { sql += " AND name LIKE ?"; params.push('%' + search + '%'); }
    sql += " ORDER BY is_bestseller DESC, id DESC";
    res.json(all(sql, params));
  } catch (error) { res.status(500).json({ error: 'Gagal mengambil data produk' }); }
});

app.get('/api/products/:id', (req, res) => {
  const p = get("SELECT * FROM products WHERE id=? AND is_active=1", [req.params.id]);
  p ? res.json(p) : res.status(404).json({ error: 'Produk tidak ditemukan' });
});

app.get('/api/stats/public', (req, res) => {
  res.json({
    total_products: get("SELECT COUNT(*) as c FROM products WHERE is_active=1")?.c || 0,
    total_orders: get("SELECT COUNT(*) as c FROM orders WHERE status='Selesai'")?.c || 0,
    total_customers: get("SELECT COUNT(*) as c FROM users WHERE role='customer'")?.c || 0,
  });
});

app.get('/api/cart', auth, (req, res) => {
  res.json(all("SELECT c.id, c.quantity, p.id as product_id, p.name, p.price, p.image_url, p.stock FROM cart c JOIN products p ON c.product_id=p.id WHERE c.user_id=?", [req.user.id]));
});

app.post('/api/cart', auth, (req, res) => {
  const { product_id, quantity } = req.body;
  const qty = parseInt(quantity) || 1;
  const p = get("SELECT * FROM products WHERE id=? AND is_active=1", [product_id]);
  if (!p) return res.status(404).json({ error: 'Produk tidak ditemukan' });
  if (p.stock < 1) return res.status(400).json({ error: 'Stok habis' });

  const existing = get("SELECT * FROM cart WHERE user_id=? AND product_id=?", [req.user.id, product_id]);
  const newQty = (existing ? existing.quantity : 0) + qty;
  if (newQty > p.stock) return res.status(400).json({ error: `Stok tidak mencukupi. Tersedia: ${p.stock}` });

  if (existing) run("UPDATE cart SET quantity=? WHERE id=?", [newQty, existing.id]);
  else run("INSERT INTO cart (user_id, product_id, quantity) VALUES (?,?,?)", [req.user.id, product_id, qty]);
  res.json({ success: true, message: 'Produk ditambahkan ke keranjang' });
});

app.put('/api/cart/:id', auth, (req, res) => {
  const { quantity } = req.body;
  const qty = parseInt(quantity);
  const item = get("SELECT c.*, p.stock FROM cart c JOIN products p ON c.product_id=p.id WHERE c.id=? AND c.user_id=?", [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item tidak ditemukan' });
  if (qty > item.stock) return res.status(400).json({ error: `Stok tidak mencukupi. Tersedia: ${item.stock}` });
  if (qty <= 0) { run("DELETE FROM cart WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  run("UPDATE cart SET quantity=? WHERE id=?", [qty, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/cart/:id', auth, (req, res) => {
  run("DELETE FROM cart WHERE id=? AND user_id=?", [req.params.id, req.user.id]);
  res.json({ success: true });
});

app.get('/api/favorites', auth, (req, res) => {
  res.json(all("SELECT f.id, p.* FROM favorites f JOIN products p ON f.product_id=p.id WHERE f.user_id=?", [req.user.id]));
});

app.post('/api/favorites/toggle', auth, (req, res) => {
  const { product_id } = req.body;
  const existing = get("SELECT id FROM favorites WHERE user_id=? AND product_id=?", [req.user.id, product_id]);
  if (existing) { run("DELETE FROM favorites WHERE id=?", [existing.id]); res.json({ success: true, action: 'removed' }); }
  else { run("INSERT INTO favorites (user_id, product_id) VALUES (?,?)", [req.user.id, product_id]); res.json({ success: true, action: 'added' }); }
});

app.post('/api/orders/checkout', auth, (req, res) => {
  const { delivery_address, notes } = req.body;
  const cartItems = all("SELECT c.quantity, p.id, p.name, p.price, p.stock FROM cart c JOIN products p ON c.product_id=p.id WHERE c.user_id=?", [req.user.id]);
  if (!cartItems.length) return res.status(400).json({ error: 'Keranjang masih kosong' });

  for (const item of cartItems) {
    if (item.quantity > item.stock) return res.status(400).json({ error: `Stok ${item.name} tidak mencukupi` });
  }

  const orderId = 'ORD-' + Date.now().toString().slice(-8);
  const total = cartItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  run("INSERT INTO orders (order_id, user_id, total_price, delivery_address, notes) VALUES (?,?,?,?,?)", [orderId, req.user.id, total, delivery_address || '', notes || '']);
  for (const i of cartItems) {
    run("INSERT INTO order_items (order_id, product_id, quantity, price, product_name) VALUES (?,?,?,?,?)", [orderId, i.id, i.quantity, i.price, i.name]);
    run("UPDATE products SET stock = stock - ? WHERE id=?", [i.quantity, i.id]);
  }
  run("DELETE FROM cart WHERE user_id=?", [req.user.id]);
  res.json({ success: true, order_id: orderId, total });
});

app.get('/api/orders/my', auth, (req, res) => {
  const orders = all("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC", [req.user.id]);
  const result = orders.map(o => ({
    ...o,
    items: all("SELECT * FROM order_items WHERE order_id=?", [o.order_id])
  }));
  res.json(result);
});

app.post('/api/orders/:orderId/payment', auth, upload.single('proof'), (req, res) => {
  const order = get("SELECT * FROM orders WHERE order_id=? AND user_id=?", [req.params.orderId, req.user.id]);
  if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  if (!req.file) return res.status(400).json({ error: 'Bukti pembayaran wajib diunggah' });
  run("UPDATE orders SET payment_proof=?, status='Menunggu Verifikasi', updated_at=CURRENT_TIMESTAMP WHERE order_id=?", ['/uploads/' + req.file.filename, req.params.orderId]);
  res.json({ success: true, message: 'Bukti pembayaran berhasil diunggah' });
});

app.post('/api/collaboration', (req, res) => {
  const { business_name, product_type, contact, message } = req.body;
  if (!business_name || !product_type || !contact) return res.status(400).json({ error: 'Semua kolom wajib diisi' });
  run("INSERT INTO collaborations (business_name, product_type, contact, message) VALUES (?,?,?,?)", [business_name, product_type, contact, message || '']);
  res.json({ success: true, message: 'Pengajuan berhasil dikirim' });
});

app.get('/api/admin/stats', ownerOnly, (req, res) => {
  res.json({
    total_products: get("SELECT COUNT(*) as c FROM products")?.c || 0,
    total_orders: get("SELECT COUNT(*) as c FROM orders")?.c || 0,
    pending_payment: get("SELECT COUNT(*) as c FROM orders WHERE status='Menunggu Verifikasi'")?.c || 0,
    revenue: get("SELECT SUM(total_price) as s FROM orders WHERE status='Selesai'")?.s || 0,
    total_customers: get("SELECT COUNT(*) as c FROM users WHERE role='customer'")?.c || 0,
    pending_orders: get("SELECT COUNT(*) as c FROM orders WHERE status='Menunggu Pembayaran'")?.c || 0,
  });
});

app.get('/api/admin/products', ownerOnly, (req, res) => res.json(all("SELECT * FROM products ORDER BY id DESC")));
app.post('/api/admin/products', ownerOnly, (req, res) => {
  const b = req.body;
  run("INSERT INTO products (name,description,price,category,image_url,stock,is_active,is_bestseller) VALUES (?,?,?,?,?,?,?,?)",
    [b.name, b.description || '', b.price, b.category || 'Kopi', b.image_url || '', b.stock || 10, b.is_active ?? 1, b.is_bestseller || 0]);
  res.json({ success: true });
});
app.put('/api/admin/products/:id', ownerOnly, (req, res) => {
  const b = req.body;
  run("UPDATE products SET name=?,description=?,price=?,category=?,image_url=?,stock=?,is_active=?,is_bestseller=? WHERE id=?",
    [b.name, b.description, b.price, b.category, b.image_url, b.stock, b.is_active, b.is_bestseller, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/admin/products/:id', ownerOnly, (req, res) => {
  run("UPDATE products SET is_active=0 WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/orders', ownerOnly, (req, res) => {
  const orders = all("SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone FROM orders o JOIN users u ON o.user_id=u.id ORDER BY o.id DESC");
  const result = orders.map(o => ({ ...o, items: all("SELECT * FROM order_items WHERE order_id=?", [o.order_id]) }));
  res.json(result);
});

app.put('/api/admin/orders/:orderId/status', ownerOnly, (req, res) => {
  const { status, reject_reason } = req.body;
  run("UPDATE orders SET status=?, reject_reason=?, updated_at=CURRENT_TIMESTAMP WHERE order_id=?", [status, reject_reason || null, req.params.orderId]);
  res.json({ success: true });
});

app.get('/api/admin/collaborations', ownerOnly, (req, res) => res.json(all("SELECT * FROM collaborations ORDER BY id DESC")));
app.put('/api/admin/collaborations/:id', ownerOnly, (req, res) => {
  run("UPDATE collaborations SET status=? WHERE id=?", [req.body.status, req.params.id]);
  res.json({ success: true });
});
app.get('/api/admin/customers', ownerOnly, (req, res) => res.json(all("SELECT id,name,email,phone,address,created_at FROM users WHERE role='customer' ORDER BY id DESC")));
app.get('/api/admin/bestsellers', ownerOnly, (req, res) => {
  res.json(all("SELECT p.name, SUM(oi.quantity) as total_sold FROM order_items oi JOIN products p ON oi.product_id=p.id GROUP BY p.id ORDER BY total_sold DESC LIMIT 5"));
});

// CHATBOT API (PERSIS SEPERTI ABU FARM)
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Auto Reply Dasar
    let reply = '';
    const msg = message.toLowerCase();
    if (msg.includes('menu') || msg.includes('produk') || msg.includes('apa saja')) {
      reply = `Berikut menu kami:\n☕ Kopi: Iced Palm Sugar, Cold Brew, Caramel Latte.\n🍵 Non-Kopi: Matcha, Thai Tea, Taro, Lemon Mojito.\nLihat lengkap di halaman Menu! 😊`;
    } else if (msg.includes('harga') || msg.includes('berapa')) {
      reply = `Harga minuman mulai dari Rp 18.000 sampai Rp 35.000. 😊`;
    } else if (msg.includes('pesan') || msg.includes('beli') || msg.includes('cara')) {
      reply = `Cara pesan: Login -> Pilih Menu -> Keranjang -> Checkout -> Transfer Bank -> Upload Bukti. Tim kami akan segera verifikasi! 🎉`;
    } else if (msg.includes('bayar') || msg.includes('rekening')) {
      reply = `BCA: 1234-5678-90\nMandiri: 0987-6543-21\na/n Fathia Adhiana. Upload bukti setelah checkout ya!`;
    }

    // Call Groq AI API dengan native fetch persis Abu Farm
    try {
      const key = process.env.GROQ_API_KEY;
      if (key && !reply) {
        const prompt = `Kamu asisten virtual Backseat Barista (Kopi online di Bogor). Jawab ramah & singkat. User: "${message}"`;
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { 
          method: 'POST', 
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }] }) 
        });
        const d = await r.json();
        if(d.choices && d.choices[0]) {
           reply = d.choices[0].message.content;
        }
      }
    } catch (e) {
      console.log('AI fallback error:', e);
    }

    res.json({ reply: reply || 'Maaf, saya kurang mengerti. Coba tanya tentang menu atau cara pesan! 😊' });
  } catch (error) {
    res.status(500).json({ error: 'Server Chatbot Error' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
['menu', 'login', 'register', 'cart', 'orders', 'favorites', 'collaboration', 'admin', 'admin-orders', 'admin-products', 'admin-customers'].forEach(p => {
  app.get('/' + p, (req, res) => res.sendFile(path.join(publicDir, p + '.html')));
});

initDb().then(() => app.listen(PORT, () => console.log(`☕ Backseat Barista running on port ${PORT}`)));