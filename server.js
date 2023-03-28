const express = require('express')
const app = express()
const mongoose = require('mongoose')
const session = require('express-session')
const passport = require('passport')
const crypto = require('crypto')

mongoose.set('strictQuery', false)
app.use(express.json())
app.use(express.urlencoded({extended: true}))

require('dotenv').config();
app.set('view engine', 'ejs')
app.use(express.static('./public'))

mongoose.connect('mongodb://127.0.0.1/rezept-organizer', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB')
}).catch((error) => {
  console.log('Error connecting to MongoDB', error.message)
})

const indexRoutes = require('./routes/index')
const ingredientRoutes = require('./routes/ingredientRoutes')
const loginRoutes = require('./routes/loginRoutes')
const recipeRoutes = require('./routes/recipeRoutes')
const shoppingListRoutes = require('./routes/shoppingListRoutes')
app.use('/', indexRoutes)
app.use('/ingredient', ingredientRoutes)
app.use('/login', loginRoutes)
app.use('/recipe', recipeRoutes)
app.use('/shoppingList', shoppingListRoutes)


app.use('/', (err, req, res, next) => {
    res.json({ err: err })
})

app.listen(3000)