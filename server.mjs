import express from "express"
import cors from "cors"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { Low } from "lowdb"
import { JSONFile } from "lowdb/node"
import { nanoid } from "nanoid"
import dotenv from "dotenv"

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const adapter = new JSONFile("db.json")
const db = new Low(adapter, { users: [], products: [], purchases: [] })
await db.read()

const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET

// 🔑 Middleware auth
function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ message: "Token ausente" })

  try {
    const token = header.split(" ")[1]
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ message: "Token inválido" })
  }
}

// 📝 Registro
app.post("/register", async (req, res) => {
  const { email, password, type = "customer", ref } = req.body
  const exists = db.data.users.find(u => u.email === email)
  if (exists) return res.status(400).json({ message: "Email já cadastrado" })

  const hashed = await bcrypt.hash(password, 10)
  const refCode = nanoid(6)

  let referredBy = null
  if (ref) {
    const refUser = db.data.users.find(u => u.refCode === ref)
    if (refUser) {
      referredBy = refUser.id
      refUser.balance += 10
    }
  }

  const user = {
    id: nanoid(),
    email,
    password: hashed,
    type,
    refCode,
    referredBy,
    balance: 0
  }

  db.data.users.push(user)
  await db.write()

  res.json({ message: "Usuário criado", refCode })
})

// 🔓 Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body
  const user = db.data.users.find(u => u.email === email)
  if (!user) return res.status(400).json({ message: "Credenciais inválidas" })

  const ok = await bcrypt.compare(password, user.password)
  if (!ok) return res.status(400).json({ message: "Credenciais inválidas" })

  const token = jwt.sign({ id: user.id, type: user.type }, JWT_SECRET, { expiresIn: "2h" })
  res.json({ token })
})

// 🛍️ Criar produto (vendedor)
app.post("/products", auth, async (req, res) => {
  if (req.user.type !== "seller") return res.status(403).json({ message: "Apenas vendedores" })

  const { name, price } = req.body
  const product = { id: nanoid(), name, price, sellerId: req.user.id }

  db.data.products.push(product)
  await db.write()
  res.json(product)
})

// 💳 Comprar produto
app.post("/buy", auth, async (req, res) => {
  const { productId } = req.body
  const product = db.data.products.find(p => p.id === productId)
  if (!product) return res.status(404).json({ message: "Produto não encontrado" })

  const purchase = { id: nanoid(), userId: req.user.id, productId }
  db.data.purchases.push(purchase)
  await db.write()

  res.json({ message: "Compra realizada", product })
})

// 👥 Ver indicações
app.get("/me/referrals", auth, async (req, res) => {
  const user = db.data.users.find(u => u.id === req.user.id)
  const referrals = db.data.users.filter(u => u.referredBy === user.id)

  res.json({
    total: referrals.length,
    saldo: user.balance,
    indicados: referrals.map(r => r.email)
  })
})

app.listen(PORT, () => console.log("🚀 MTK Shopping rodando na porta", PORT))
