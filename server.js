import express from "express"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import { Low } from "lowdb"
import { JSONFile } from "lowdb/node"
import dotenv from "dotenv"
import { nanoid } from "nanoid"

dotenv.config()

const app = express()
app.use(express.json())

const SECRET = "mtk_super_secret"

// ====== BANCO DE DADOS ======
const adapter = new JSONFile("db.json")
const db = new Low(adapter, {
  users: [],
  products: [],
  purchases: []
})

await db.read()
await db.write()

// ====== FUNÇÕES ======
function generateToken(user) {
  return jwt.sign({ id: user.id, type: user.type }, SECRET, { expiresIn: "1d" })
}

function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ message: "Token ausente" })

  try {
    const token = header.split(" ")[1]
    const decoded = jwt.verify(token, SECRET)
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ message: "Token inválido" })
  }
}

// ====== ROTA INICIAL ======
app.get("/", (req, res) => {
  res.send("🚀 MTK SHOPPING API ONLINE")
})

/* =========================
   👤 REGISTRO
========================= */
app.post("/register", async (req, res) => {
  const { email, password, type = "customer", ref } = req.body

  if (db.data.users.find(u => u.email === email))
    return res.status(400).json({ message: "Email já existe" })

  const hashed = bcrypt.hashSync(password, 8)
  const refCode = nanoid(6)

  const user = {
    id: Date.now(),
    email,
    password: hashed,
    type,
    refCode,
    referredBy: null,
    balance: 0,
    referrals: []
  }

  if (ref) {
    const refUser = db.data.users.find(u => u.refCode === ref)
    if (refUser) {
      user.referredBy = refUser.id
      refUser.referrals.push(user.id)
    }
  }

  db.data.users.push(user)
  await db.write()

  res.json({
    message: "Usuário criado",
    refLink: `http://localhost:3000/register?ref=${refCode}`
  })
})

/* =========================
   🔐 LOGIN
========================= */
app.post("/login", (req, res) => {
  const { email, password } = req.body
  const user = db.data.users.find(u => u.email === email)
  if (!user) return res.status(400).json({ message: "Credenciais inválidas" })

  if (!bcrypt.compareSync(password, user.password))
    return res.status(400).json({ message: "Credenciais inválidas" })

  res.json({ token: generateToken(user) })
})

/* =========================
   🛍️ CRIAR PRODUTO (VENDEDOR)
========================= */
app.post("/products", auth, async (req, res) => {
  if (req.user.type !== "seller")
    return res.status(403).json({ message: "Apenas vendedores" })

  const { name, price } = req.body

  const product = {
    id: Date.now(),
    name,
    price,
    sellerId: req.user.id
  }

  db.data.products.push(product)
  await db.write()
  res.json(product)
})

/* =========================
   📦 LISTAR PRODUTOS
========================= */
app.get("/products", (req, res) => {
  res.json(db.data.products)
})

/* =========================
   💳 COMPRAR PRODUTO
========================= */
app.post("/buy", auth, async (req, res) => {
  if (req.user.type !== "customer")
    return res.status(403).json({ message: "Apenas clientes compram" })

  const { productId } = req.body
  const product = db.data.products.find(p => p.id == productId)
  if (!product) return res.status(404).json({ message: "Produto não encontrado" })

  const buyer = db.data.users.find(u => u.id === req.user.id)

  // comissão afiliado
  if (buyer.referredBy) {
    const refUser = db.data.users.find(u => u.id === buyer.referredBy)
    const commission = product.price * 0.1
    refUser.balance += commission
  }

  db.data.purchases.push({
    id: Date.now(),
    productId,
    buyerId: buyer.id,
    date: new Date()
  })

  await db.write()
  res.json({ message: "Compra realizada com sucesso" })
})

/* =========================
   🤝 MEUS INDICADOS
========================= */
app.get("/me/referrals", auth, (req, res) => {
  const user = db.data.users.find(u => u.id === req.user.id)

  if (!user) return res.status(404).json({ error: "Usuário não encontrado" })

  const people = user.referrals.map(id => {
    const u = db.data.users.find(x => x.id === id)
    return { id: u.id, email: u.email }
  })

  res.json({
    totalIndicados: people.length,
    saldo: user.balance,
    pessoasIndicadas: people
  })
})

/* =========================
   💰 MEU SALDO
========================= */
app.get("/me/balance", auth, (req, res) => {
  const user = db.data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" })

  res.json({ saldo: user.balance })
})

/* =========================
   🧾 MINHAS COMPRAS
========================= */
app.get("/me/purchases", auth, (req, res) => {
  const list = db.data.purchases.filter(p => p.buyerId === req.user.id)
  res.json(list)
})

/* =========================
   🚀 SERVIDOR
========================= */
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("🔥 MTK SHOPPING API rodando na porta " + PORT)
})
app.get("/", (req, res) => {
  res.send("🚀 MTK SHOPPING API ONLINE");
});
