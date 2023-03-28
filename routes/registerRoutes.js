const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const User = require('../config/database/userSchema')

router.get('/', (req, res) => {
    res.render('register.ejs')
})

router.post('/', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10)

        const newUser = new User({
            name: req.body.username,
            password: hashedPassword,
            recipeList: [],
            ingredientList: []
        })
        await newUser.save()
        res.redirect('/login')
    } catch (err) {
        res.redirect('/register')
    }
})

module.exports = router