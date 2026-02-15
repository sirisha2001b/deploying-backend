const express = require("express")
const path = require("path")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const cors = require("cors")
const Database = require("better-sqlite3")

const app = express()
app.use(express.json())
app.use(cors())

const dbPath = path.join(__dirname, "todo.db")
let db = null

/* ---------------- DB INITIALIZATION ---------------- */

const initializeDbAndServer = () => {
  try {
    db = new Database(dbPath)
    console.log("SQLite DB Connected")

    // users table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT
      )
    `).run()

    // transactions table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        amount REAL,
        category TEXT,
        date TEXT,
        notes TEXT
      )
    `).run()

    const PORT = process.env.PORT || 3000
    app.listen(PORT, () => {
      console.log(`Server Running at http://localhost:${PORT}/`)
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

/* ---------------- AUTHENTICATION ---------------- */

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"]
  if (authHeader === undefined) {
    response.status(401).send("Invalid JWT Token")
  } else {
    jwt.verify(authHeader, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401).send("Invalid JWT Token")
      } else {
        request.userId = payload.userId
        next()
      }
    })
  }
}

/* ---------------- USER SIGNUP ---------------- */

app.post("/users/register/", async (request, response) => {
  const { name, email, password } = request.body
  const hashedPassword = await bcrypt.hash(password, 10)

  const dbUser = db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(email)

  if (dbUser === undefined) {
    db.prepare(`
      INSERT INTO users (name, email, password)
      VALUES (?, ?, ?)
    `).run(name, email, hashedPassword)

    response.send("User Registered Successfully")
  } else {
    response.status(400).send("User already exists")
  }
})

/* ---------------- USER LOGIN ---------------- */

app.post("/users/login/", async (request, response) => {
  const { email, password } = request.body

  const dbUser = db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(email)

  if (dbUser === undefined) {
    response.status(400).send("Invalid User")
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      dbUser.password
    )

    if (isPasswordMatched) {
      const payload = { userId: dbUser.id }
      const jwtToken = jwt.sign(payload, "SECRET_KEY")
      response.send({ jwtToken })
    } else {
      response.status(400).send("Invalid Password")
    }
  }
})

/* ---------------- ADD TRANSACTION ---------------- */

app.post("/transactions/", authenticateToken, (request, response) => {
  const { title, amount, category, date, notes } = request.body

  db.prepare(`
    INSERT INTO transactions
      (user_id, title, amount, category, date, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(request.userId, title, amount, category, date, notes)

  response.send("Transaction Added Successfully")
})

/* ---------------- GET ALL TRANSACTIONS ---------------- */

app.get("/transactions/", authenticateToken, (request, response) => {
  const transactions = db.prepare(`
    SELECT *
    FROM transactions
    WHERE user_id = ?
    ORDER BY date DESC
  `).all(request.userId)

  response.send(transactions)
})

/* ---------------- GET SINGLE TRANSACTION ---------------- */

app.get("/transactions/:id/", authenticateToken, (request, response) => {
  const { id } = request.params

  const transaction = db.prepare(`
    SELECT *
    FROM transactions
    WHERE id = ? AND user_id = ?
  `).get(id, request.userId)

  if (transaction === undefined) {
    response.status(404).send("Transaction Not Found")
  } else {
    response.send(transaction)
  }
})

/* ---------------- UPDATE TRANSACTION ---------------- */

app.put("/transactions/:id/", authenticateToken, (request, response) => {
  const { id } = request.params
  const { title, amount, category, date, notes } = request.body

  db.prepare(`
    UPDATE transactions
    SET title = ?, amount = ?, category = ?, date = ?, notes = ?
    WHERE id = ? AND user_id = ?
  `).run(title, amount, category, date, notes, id, request.userId)

  response.send("Transaction Updated Successfully")
})

/* ---------------- DELETE TRANSACTION ---------------- */

app.delete("/transactions/:id/", authenticateToken, (request, response) => {
  const { id } = request.params

  db.prepare(`
    DELETE FROM transactions
    WHERE id = ? AND user_id = ?
  `).run(id, request.userId)

  response.send("Transaction Deleted Successfully")
})

/* ---------------- DASHBOARD SUMMARY ---------------- */

app.get("/dashboard/summary/", authenticateToken, (request, response) => {
  const total = db.prepare(`
    SELECT SUM(amount) AS totalExpense
    FROM transactions
    WHERE user_id = ?
  `).get(request.userId)

  const categories = db.prepare(`
    SELECT category, SUM(amount) AS total
    FROM transactions
    WHERE user_id = ?
    GROUP BY category
  `).all(request.userId)

  response.send({
    totalExpense: total.totalExpense || 0,
    categoryBreakdown: categories
  })
})
