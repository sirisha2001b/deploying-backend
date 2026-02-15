const express = require('express')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const cors = require("cors")

const app = express()
app.use(express.json())
app.use(cors())

const dbPath = path.join(__dirname, "todo.db")
let db = null

/* ---------------- DB INITIALIZATION ---------------- */

const initializeDbAndServer = () => {
  try {
    db = new sqlite3.Database(dbPath, (error) => {
      if (error) {
        console.log(`DB Error: ${error.message}`)
        process.exit(1)
      } else {
        console.log("SQLite DB Connected")
      }
    })

    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/")
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
    response.status(401)
    response.send("Invalid JWT Token")
  } else {
    jwt.verify(authHeader, "SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401)
        response.send("Invalid JWT Token")
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

  const checkUserQuery = `
    SELECT *
    FROM users
    WHERE email = '${email}';
  `
  const dbUser = await db.get(checkUserQuery)

  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO users(name, email, password)
      VALUES (
        '${name}',
        '${email}',
        '${hashedPassword}'
      );
    `
    await db.run(createUserQuery)
    response.send("User Registered Successfully")
  } else {
    response.status(400)
    response.send("User already exists")
  }
})

/* ---------------- USER LOGIN ---------------- */

app.post("/users/login/", async (request, response) => {
  const { email, password } = request.body

  const getUserQuery = `
    SELECT *
    FROM users
    WHERE email = '${email}';
  `
  const dbUser = await db.get(getUserQuery)

  if (dbUser === undefined) {
    response.status(400)
    response.send("Invalid User")
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
      response.status(400)
      response.send("Invalid Password")
    }
  }
})

/* ---------------- ADD TRANSACTION ---------------- */

app.post("/transactions/", authenticateToken, async (request, response) => {
  const { title, amount, category, date, notes } = request.body

  const createTransactionQuery = `
    INSERT INTO transactions
      (user_id, title, amount, category, date, notes)
    VALUES (
      ${request.userId},
      '${title}',
      ${amount},
      '${category}',
      '${date}',
      '${notes}'
    );
  `
  await db.run(createTransactionQuery)

  response.send("Transaction Added Successfully")
})

/* ---------------- GET ALL TRANSACTIONS ---------------- */

app.get("/transactions/", authenticateToken, async (request, response) => {
  const getTransactionsQuery = `
    SELECT *
    FROM transactions
    WHERE user_id = ${request.userId}
    ORDER BY date DESC;
  `
  const transactions = await db.all(getTransactionsQuery)
  response.send(transactions)
})

/* ---------------- GET SINGLE TRANSACTION ---------------- */

app.get("/transactions/:id/", authenticateToken, async (request, response) => {
  const { id } = request.params

  const getTransactionQuery = `
    SELECT *
    FROM transactions
    WHERE id = ${id}
      AND user_id = ${request.userId};
  `
  const transaction = await db.get(getTransactionQuery)

  if (transaction === undefined) {
    response.status(404)
    response.send("Transaction Not Found")
  } else {
    response.send(transaction)
  }
})

/* ---------------- UPDATE TRANSACTION ---------------- */

app.put("/transactions/:id/", authenticateToken, async (request, response) => {
  const { id } = request.params
  const { title, amount, category, date, notes } = request.body

  const updateQuery = `
    UPDATE transactions
    SET
      title = '${title}',
      amount = ${amount},
      category = '${category}',
      date = '${date}',
      notes = '${notes}'
    WHERE id = ${id}
      AND user_id = ${request.userId};
  `
  await db.run(updateQuery)

  response.send("Transaction Updated Successfully")
})

/* ---------------- DELETE TRANSACTION ---------------- */

app.delete("/transactions/:id/", authenticateToken, async (request, response) => {
  const { id } = request.params

  const deleteQuery = `
    DELETE FROM transactions
    WHERE id = ${id}
      AND user_id = ${request.userId};
  `
  await db.run(deleteQuery)

  response.send("Transaction Deleted Successfully")
})

/* ---------------- DASHBOARD SUMMARY ---------------- */

app.get("/dashboard/summary/", authenticateToken, async (request, response) => {
  const totalQuery = `
    SELECT SUM(amount) AS totalExpense
    FROM transactions
    WHERE user_id = ${request.userId};
  `

  const categoryQuery = `
    SELECT category, SUM(amount) AS total
    FROM transactions
    WHERE user_id = ${request.userId}
    GROUP BY category;
  `

  const total = await db.get(totalQuery)
  const categories = await db.all(categoryQuery)

  response.send({
    totalExpense: total.totalExpense || 0,
    categoryBreakdown: categories,
  })
})
